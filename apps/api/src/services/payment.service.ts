import crypto from "crypto";
import { ApiEnvironment, Network, Prisma, Transaction, TransactionStatus, TransactionType } from "@prisma/client";
import { prisma } from "@/utils/prisma";
import { AppError } from "@/utils/errors";
import { newTransactionId } from "@/utils/ids";
import { getProvider } from "@/providers/provider.factory";
import { NetworkCode, ProviderTxStatus } from "@/providers/provider.types";
import { assertAmountInRange, computeQuote, getFeeConfig } from "@/services/fee.service";
import { enqueueEvent, WebhookEvent } from "@/services/webhook.service";
import { recordTransaction } from "@/services/usage.service";
import { logProviderCall } from "@/services/provider.service";
import { audit } from "@/services/audit.service";
import { pollOnce } from "@/workers/webhookDelivery.worker";

export interface KeyContext {
  clientId: string;
  apiKeyId: string;
  environment: ApiEnvironment;
  requestId: string;
}

export interface CreatePaymentBody {
  amount: number;
  currency: "HTG" | "USD";
  phone: string;
  reference?: string;
  description?: string;
  // Payments: where the payer returns after the hosted payment page.
  success_url?: string;
  error_url?: string;
  // Transfers: the person receiving the money.
  recipient?: { first_name: string; last_name: string };
}

const PAYMENT_EVENTS: Record<TransactionStatus, WebhookEvent | null> = {
  PENDING: "payment.pending",
  PROCESSING: "payment.processing",
  COMPLETED: "payment.completed",
  FAILED: "payment.failed",
  CANCELLED: null,
};
// Transfers have no "processing" event: they go pending -> completed | failed.
const TRANSFER_EVENTS: Record<TransactionStatus, WebhookEvent | null> = {
  PENDING: "transfer.pending",
  PROCESSING: null,
  COMPLETED: "transfer.completed",
  FAILED: "transfer.failed",
  CANCELLED: null,
};
const eventFor = (type: TransactionType, status: TransactionStatus) => (type === "TRANSFER" ? TRANSFER_EVENTS : PAYMENT_EVENTS)[status];

export function serializeTransaction(t: Transaction) {
  return {
    success: true,
    transaction_id: t.id,
    status: t.status.toLowerCase(),
    provider: t.provider.toLowerCase(),
    type: t.type.toLowerCase(),
    amount: Number(t.amount),
    fee: Number(t.feeAmount),
    total: Number(t.totalAmount),
    currency: t.currency,
    phone: t.phone,
    reference: t.externalReference,
    description: t.description,
    ...(t.paymentUrl ? { payment_url: t.paymentUrl } : {}),
    environment: t.environment.toLowerCase(),
    request_id: t.requestId,
    error: t.errorCode ? { code: t.errorCode, message: t.errorMessage } : null,
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
  };
}

const fingerprint = (network: Network, type: TransactionType, body: CreatePaymentBody) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify([type, network, body.amount, body.currency, body.phone, body.reference ?? null, body.description ?? null, body.success_url ?? null, body.error_url ?? null, body.recipient?.first_name ?? null, body.recipient?.last_name ?? null]))
    .digest("hex");

// Events, webhook and audit trail for a status that has just been written.
async function emitStatus(t: Transaction, status: TransactionStatus, source: string, raw: Record<string, unknown>) {
  await prisma.transactionEvent.create({ data: { transactionId: t.id, status, source, rawPayload: raw as Prisma.InputJsonValue } });
  const event = eventFor(t.type, status);
  if (event) {
    await enqueueEvent(t.clientId, t.id, event, {
      transaction_id: t.id,
      type: t.type.toLowerCase(),
      amount: Number(t.amount),
      currency: t.currency,
      provider: t.provider.toLowerCase(),
      status: status.toLowerCase(),
      reference: t.externalReference,
      request_id: t.requestId,
      created_at: new Date().toISOString(),
    });
  }
}

async function recordStatus(t: Transaction, status: TransactionStatus, source: string, raw: Record<string, unknown>, extra: Partial<Prisma.TransactionUpdateInput> = {}) {
  const updated = await prisma.transaction.update({ where: { id: t.id }, data: { status, ...extra } });
  await emitStatus(t, status, source, raw);
  return updated;
}

// Moves a transaction out of PENDING/PROCESSING exactly once. Two racers (a
// provider notification and a poll, say) can't both apply the same outcome or
// enqueue duplicate webhooks, and a terminal state is never overwritten.
async function settle(t: Transaction, status: TransactionStatus, source: string, raw: Record<string, unknown>, extra: { errorCode?: string; errorMessage?: string } = {}) {
  const { count } = await prisma.transaction.updateMany({
    where: { id: t.id, status: { in: ["PENDING", "PROCESSING"] } },
    data: { status, ...extra },
  });
  if (count === 1) await emitStatus(t, status, source, raw);
  return (await prisma.transaction.findUnique({ where: { id: t.id } })) ?? t;
}

const fromProviderStatus = (s: ProviderTxStatus): TransactionStatus => s;

type Db = Prisma.TransactionClient | typeof prisma;

// Money a client can send out: what they've collected from completed payments
// (net of fees) minus everything already sent or reserved by
// pending/processing/completed transfers (amount + fee). A failed transfer
// releases its reservation. The pool is per currency and environment and is
// shared by both networks — the platform holds one provider wallet, and some
// networks can only be paid out to, not collected on. Payouts can only ever draw
// on the client's OWN collected funds, never on the platform's provider wallet.
// Money added by recharging (LIVE, HTG): completed fundings.
async function fundedTotal(db: Db, clientId: string, environment: ApiEnvironment, currency: string) {
  if (environment !== "LIVE" || currency !== "HTG") return new Prisma.Decimal(0);
  const sum = await db.funding.aggregate({ where: { clientId, status: "COMPLETED", currency: "HTG" }, _sum: { creditedAmount: true } });
  return sum._sum.creditedAmount ?? new Prisma.Decimal(0);
}

async function availableBalance(db: Db, clientId: string, environment: ApiEnvironment, currency: "HTG" | "USD") {
  const groups = await db.transaction.groupBy({
    by: ["type", "status"],
    where: { clientId, environment, currency, status: { in: ["PENDING", "PROCESSING", "COMPLETED"] } },
    _sum: { amount: true, feeAmount: true },
  });
  let available = await fundedTotal(db, clientId, environment, currency);
  for (const g of groups) {
    const amount = g._sum.amount ?? new Prisma.Decimal(0);
    const fee = g._sum.feeAmount ?? new Prisma.Decimal(0);
    if (g.type === "PAYMENT" && g.status === "COMPLETED") available = available.plus(amount).minus(fee);
    if (g.type === "TRANSFER") available = available.minus(amount).minus(fee);
  }
  return available;
}

async function createOperation(
  ctx: KeyContext,
  network: Network,
  type: TransactionType,
  body: CreatePaymentBody,
  idempotencyKey: string
): Promise<{ transaction: Transaction; replayed: boolean }> {
  const config = await getFeeConfig();
  assertAmountInRange(body.amount, body.currency, config);

  const print = fingerprint(network, type, body);
  const providerInput = {
    network: network as NetworkCode,
    amount: body.amount,
    currency: body.currency,
    phone: body.phone,
    reference: body.reference,
    description: body.description,
    requestId: ctx.requestId,
    successUrl: body.success_url,
    errorUrl: body.error_url,
    recipient: body.recipient ? { firstName: body.recipient.first_name, lastName: body.recipient.last_name } : undefined,
  };
  const findExisting = () =>
    prisma.transaction.findFirst({ where: { clientId: ctx.clientId, environment: ctx.environment, idempotencyKey } });

  const existing = await findExisting();
  if (existing) return replay(existing, print);

  // Refuse what the provider couldn't carry out (unsupported network, missing
  // recipient...) before anything is created or any funds are reserved.
  await getProvider(ctx.environment).validate?.(type, providerInput);

  const quote = computeQuote(body.amount, body.currency, config);

  const row = {
    id: newTransactionId(),
    clientId: ctx.clientId,
    apiKeyId: ctx.apiKeyId,
    environment: ctx.environment,
    provider: network,
    type,
    amount: body.amount,
    currency: body.currency,
    feeAmount: quote.fee,
    totalAmount: quote.total,
    phone: body.phone,
    externalReference: body.reference,
    description: body.description,
    status: "PENDING" as const,
    requestId: ctx.requestId,
    idempotencyKey,
    requestFingerprint: print,
  };

  let created: Transaction;
  try {
    if (type === "TRANSFER") {
      // Check the balance and reserve the funds atomically: an advisory lock per
      // client+environment+currency serializes concurrent transfers, so two racing
      // requests can never both spend the same money.
      created = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${ctx.clientId}:${ctx.environment}:${body.currency}`}))`;
        const available = await availableBalance(tx, ctx.clientId, ctx.environment, body.currency);
        if (available.lt(quote.total)) {
          throw new AppError("INSUFFICIENT_BALANCE", `Insufficient balance: ${available.toFixed(2)} ${body.currency} available, ${quote.total} ${body.currency} required (amount + fee).`);
        }
        return tx.transaction.create({ data: row });
      });
    } else {
      created = await prisma.transaction.create({ data: row });
    }
  } catch (error) {
    // Two concurrent requests with the same Idempotency-Key: the loser replays the winner.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await findExisting();
      if (winner) return replay(winner, print);
    }
    throw error;
  }

  await recordTransaction(ctx.clientId);
  await prisma.transactionEvent.create({ data: { transactionId: created.id, status: "PENDING", source: "api", rawPayload: {} } });
  const pendingEvent = eventFor(type, "PENDING");
  if (pendingEvent) {
    await enqueueEvent(ctx.clientId, created.id, pendingEvent, {
      transaction_id: created.id, type: type.toLowerCase(), amount: body.amount, currency: body.currency, provider: network.toLowerCase(),
      status: "pending", reference: body.reference ?? null, request_id: ctx.requestId, created_at: new Date().toISOString(),
    });
  }

  const providerCode = network.toLowerCase();
  const started = Date.now();
  try {
    const provider = getProvider(ctx.environment);
    const input = { ...providerInput, transactionId: created.id };
    const result = type === "TRANSFER" ? await provider.createTransfer(input) : await provider.createPayment(input);
    if (ctx.environment === "LIVE") {
      await logProviderCall({ providerCode, operation: type === "TRANSFER" ? "createTransfer" : "createPayment", requestId: ctx.requestId, success: true, responseMs: Date.now() - started });
    }
    const status = fromProviderStatus(result.status);
    const updated =
      status === "PENDING"
        ? await prisma.transaction.update({ where: { id: created.id }, data: { providerTransactionId: result.providerTransactionId, paymentUrl: result.redirectUrl } })
        : await recordStatus(created, status, "provider", { provider_transaction_id: result.providerTransactionId }, {
            providerTransactionId: result.providerTransactionId,
            paymentUrl: result.redirectUrl,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
          });
    await pollOnce().catch(() => undefined);
    return { transaction: updated, replayed: false };
  } catch (error) {
    const appError = error instanceof AppError ? error : new AppError("PROVIDER_ERROR", "The provider request failed.");
    if (ctx.environment === "LIVE") {
      await logProviderCall({ providerCode, operation: type === "TRANSFER" ? "createTransfer" : "createPayment", requestId: ctx.requestId, success: false, responseMs: Date.now() - started, errorCode: appError.code, errorMessage: appError.message });
    }
    // A timeout leaves the real outcome unknown (money may have moved), so it
    // stays PROCESSING for reconciliation instead of being marked FAILED — and
    // for transfers that keeps the funds reserved rather than releasing them.
    const unknown = appError.code === "PROVIDER_TIMEOUT";
    await recordStatus(created, unknown ? "PROCESSING" : "FAILED", "provider", { error: appError.code }, {
      errorCode: appError.code,
      errorMessage: appError.message,
    });
    await pollOnce().catch(() => undefined);
    throw appError;
  }
}

export const createPayment = (ctx: KeyContext, network: Network, body: CreatePaymentBody, idempotencyKey: string) =>
  createOperation(ctx, network, "PAYMENT", body, idempotencyKey);

export const createTransfer = (ctx: KeyContext, network: Network, body: CreatePaymentBody, idempotencyKey: string) =>
  createOperation(ctx, network, "TRANSFER", body, idempotencyKey);

function replay(existing: Transaction, print: string) {
  if (existing.requestFingerprint && existing.requestFingerprint !== print) {
    throw new AppError("INVALID_REQUEST", "This Idempotency-Key was already used with different parameters.", { status: 422 });
  }
  return { transaction: existing, replayed: true };
}

export async function getTransaction(clientId: string, environment: ApiEnvironment, id: string, network?: Network, options: { refresh?: boolean } = {}) {
  const t = await prisma.transaction.findFirst({ where: { id, clientId, environment, ...(network ? { provider: network } : {}) } });
  if (!t) throw new AppError("TRANSACTION_NOT_FOUND", "Transaction not found.");
  // A LIVE transaction still in flight is re-checked with the provider when a
  // client asks about it (rate-limited by the freshness window), so results
  // don't depend on a notification or the daily job.
  if (options.refresh && needsSync(t) && Date.now() - t.updatedAt.getTime() > 5_000) {
    return (await syncFromProvider(t, "poll")).transaction;
  }
  return t;
}

export async function listTransactions(
  clientId: string,
  environment: ApiEnvironment | undefined,
  filters: { network?: Network; status?: TransactionStatus; type?: TransactionType; limit: number; before?: Date }
) {
  const rows = await prisma.transaction.findMany({
    where: {
      clientId,
      ...(environment ? { environment } : {}),
      ...(filters.network ? { provider: filters.network } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.before ? { createdAt: { lt: filters.before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: filters.limit,
  });
  return rows;
}

// "Balance" for a client is what HaitiPay holds for them: what they've collected
// from completed payments (on any network), less fees, less what they've sent out
// (or reserved for pending transfers). It never exposes the platform's own
// provider wallet, which belongs to the operator.
export async function getCollectedBalance(clientId: string, environment: ApiEnvironment) {
  const groups = await prisma.transaction.groupBy({
    by: ["currency", "type", "status"],
    where: { clientId, environment, status: { in: ["PENDING", "PROCESSING", "COMPLETED"] } },
    _sum: { amount: true, feeAmount: true },
  });
  const funded = await fundedTotal(prisma, clientId, environment, "HTG");
  const byCurrency = new Map<string, { collected: Prisma.Decimal; fees: Prisma.Decimal; sent: Prisma.Decimal; sentFees: Prisma.Decimal; funded: Prisma.Decimal }>();
  if (funded.gt(0)) byCurrency.set("HTG", { collected: new Prisma.Decimal(0), fees: new Prisma.Decimal(0), sent: new Prisma.Decimal(0), sentFees: new Prisma.Decimal(0), funded });
  for (const g of groups) {
    const row = byCurrency.get(g.currency) ?? { collected: new Prisma.Decimal(0), fees: new Prisma.Decimal(0), sent: new Prisma.Decimal(0), sentFees: new Prisma.Decimal(0), funded: new Prisma.Decimal(0) };
    const amount = g._sum.amount ?? new Prisma.Decimal(0);
    const fee = g._sum.feeAmount ?? new Prisma.Decimal(0);
    if (g.type === "PAYMENT" && g.status === "COMPLETED") { row.collected = row.collected.plus(amount); row.fees = row.fees.plus(fee); }
    if (g.type === "TRANSFER") { row.sent = row.sent.plus(amount); row.sentFees = row.sentFees.plus(fee); }
    byCurrency.set(g.currency, row);
  }
  return [...byCurrency.entries()].map(([currency, r]) => ({
    currency,
    collected: r.collected.toNumber(),
    fees: r.fees.toNumber(),
    net: r.collected.minus(r.fees).toNumber(),
    funded: r.funded.toNumber(),
    sent: r.sent.toNumber(),
    transfer_fees: r.sentFees.toNumber(),
    available: r.collected.minus(r.fees).plus(r.funded).minus(r.sent).minus(r.sentFees).toNumber(),
  }));
}

// Sandbox only: drives a TEST transaction to a terminal state. Real (LIVE)
// transaction states can only be changed by the backend from provider results —
// never by a client or a browser.
export async function simulateTransaction(ctx: KeyContext, id: string, outcome: "completed" | "failed") {
  if (ctx.environment !== "TEST") throw new AppError("FORBIDDEN", "Simulation is only available with a TEST API key.");
  const t = await getTransaction(ctx.clientId, "TEST", id);
  if (t.status !== "PENDING" && t.status !== "PROCESSING") {
    throw new AppError("INVALID_REQUEST", `Transaction is already ${t.status.toLowerCase()}.`, { status: 409 });
  }
  const status: TransactionStatus = outcome === "completed" ? "COMPLETED" : "FAILED";
  const updated = await recordStatus(t, status, "sandbox_simulation", { outcome }, outcome === "failed" ? { errorCode: "TRANSACTION_FAILED", errorMessage: "Payment declined (simulated)" } : {});
  await pollOnce().catch(() => undefined);
  return updated;
}

// ---- Reconciliation with the provider -----------------------------------------

const needsSync = (t: Transaction) => t.environment === "LIVE" && Boolean(t.providerTransactionId) && (t.status === "PENDING" || t.status === "PROCESSING");

// Asks the provider what really happened and applies it. The provider's answer
// (fetched by us, not taken from a request body) is the only thing that can
// complete or fail a LIVE transaction. `reached` tells callers whether the
// provider could be consulted, so a notification can be retried if not.
export async function syncFromProvider(t: Transaction, source: string): Promise<{ transaction: Transaction; reached: boolean }> {
  if (!needsSync(t)) return { transaction: t, reached: true };
  const started = Date.now();
  let result;
  try {
    result = await getProvider("LIVE").getPayment(t.provider as NetworkCode, t.providerTransactionId as string);
  } catch {
    return { transaction: t, reached: false };
  }
  await logProviderCall({ providerCode: t.provider.toLowerCase(), operation: "getPayment", requestId: t.requestId, success: true, responseMs: Date.now() - started });

  // Never complete for an amount other than the one requested.
  if (result.amount !== undefined && Number(result.amount) !== Number(t.amount)) {
    await audit({ action: "provider.amount_mismatch", targetType: "transaction", targetId: t.id, clientId: t.clientId, metadata: { transaction_id: t.id, expected: Number(t.amount), reported: result.amount } });
    return { transaction: t, reached: true };
  }
  if (result.status === t.status || result.status === "PENDING" || (result.status === "PROCESSING" && t.status === "PROCESSING")) {
    return { transaction: t, reached: true };
  }
  if (result.status === "PROCESSING") return { transaction: t, reached: true };

  const failed = result.status === "FAILED" || result.status === "CANCELLED";
  const transaction = await settle(t, result.status, source, { provider_status: result.status.toLowerCase() }, failed ? {
    errorCode: "TRANSACTION_FAILED",
    errorMessage: result.status === "CANCELLED" ? "The payment was cancelled." : t.type === "TRANSFER" ? "The transfer failed." : "The payment was not completed.",
  } : {});
  return { transaction, reached: true };
}

// Settles LIVE transactions still in flight. Used by the daily job and safe to
// run any time; each transaction is checked against the provider.
export async function reconcileLive(limit = 25, olderThanMs = 60_000) {
  const rows = await prisma.transaction.findMany({
    where: { environment: "LIVE", status: { in: ["PENDING", "PROCESSING"] }, providerTransactionId: { not: null }, updatedAt: { lt: new Date(Date.now() - olderThanMs) } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let settled = 0;
  for (const t of rows) {
    const { transaction } = await syncFromProvider(t, "reconcile");
    if (transaction.status !== t.status) settled++;
  }
  return { checked: rows.length, settled };
}

// Administrator override for a LIVE transaction the provider could not settle
// (typically a transfer whose confirmation was lost). Audited; only from an
// in-flight state, and it can never overwrite a terminal state.
export async function resolveManually(id: string, outcome: "completed" | "failed", actor: { userId: string; ip?: string }, note: string) {
  const t = await prisma.transaction.findUnique({ where: { id } });
  if (!t) throw new AppError("TRANSACTION_NOT_FOUND", "Transaction not found.");
  if (t.environment !== "LIVE") throw new AppError("INVALID_REQUEST", "Only LIVE transactions can be resolved manually.");
  if (t.status !== "PENDING" && t.status !== "PROCESSING") throw new AppError("CONFLICT", `Transaction is already ${t.status.toLowerCase()}.`);
  const status: TransactionStatus = outcome === "completed" ? "COMPLETED" : "FAILED";
  const updated = await settle(t, status, "admin", { note }, outcome === "failed" ? { errorCode: "TRANSACTION_FAILED", errorMessage: "The transaction did not complete." } : {});
  await audit({ action: "admin.transaction_resolved", actorUserId: actor.userId, ip: actor.ip, metadata: { transaction_id: id, outcome, note } });
  return updated;
}
