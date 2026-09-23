import crypto from "crypto";
import { ApiEnvironment, Network, Prisma, Transaction, TransactionStatus, TransactionType } from "@prisma/client";
import { prisma } from "@/utils/prisma";
import { AppError } from "@/utils/errors";
import { newTransactionId } from "@/utils/ids";
import { getProvider } from "@/providers/provider.factory";
import { NetworkCode, ProviderTxStatus } from "@/providers/provider.types";
import { assertAmountInRange, computeQuote, getFeeConfig } from "@/services/fee.service";
import { getEntitlements } from "@/services/entitlements.service";
import { enqueueEvent, WebhookEvent } from "@/services/webhook.service";
import { recordTransaction } from "@/services/usage.service";
import { logProviderCall } from "@/services/provider.service";
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
    .update(JSON.stringify([type, network, body.amount, body.currency, body.phone, body.reference ?? null, body.description ?? null]))
    .digest("hex");

async function recordStatus(t: Transaction, status: TransactionStatus, source: string, raw: Record<string, unknown>, extra: Partial<Prisma.TransactionUpdateInput> = {}) {
  const updated = await prisma.transaction.update({ where: { id: t.id }, data: { status, ...extra } });
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
  return updated;
}

const fromProviderStatus = (s: ProviderTxStatus): TransactionStatus => s;

type Db = Prisma.TransactionClient | typeof prisma;

// Money a client can send out on a network: what they've collected from
// completed payments (net of fees) minus everything already sent or reserved by
// pending/processing/completed transfers (amount + fee). A failed transfer
// releases its reservation. Payouts can only ever draw on the client's OWN
// collected funds — never on the platform's provider wallet.
async function availableBalance(db: Db, clientId: string, environment: ApiEnvironment, network: Network, currency: "HTG" | "USD") {
  const groups = await db.transaction.groupBy({
    by: ["type", "status"],
    where: { clientId, environment, provider: network, currency, status: { in: ["PENDING", "PROCESSING", "COMPLETED"] } },
    _sum: { amount: true, feeAmount: true },
  });
  let available = new Prisma.Decimal(0);
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
  const findExisting = () =>
    prisma.transaction.findFirst({ where: { clientId: ctx.clientId, environment: ctx.environment, idempotencyKey } });

  const existing = await findExisting();
  if (existing) return replay(existing, print);

  const entitlements = await getEntitlements(ctx.clientId);
  const quote = computeQuote(body.amount, body.currency, config, entitlements.transactionFeeBps);

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
      // client+network+currency serializes concurrent transfers, so two racing
      // requests can never both spend the same money.
      created = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${ctx.clientId}:${ctx.environment}:${network}:${body.currency}`}))`;
        const available = await availableBalance(tx, ctx.clientId, ctx.environment, network, body.currency);
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
    const input = {
      network: network as NetworkCode,
      amount: body.amount,
      currency: body.currency,
      phone: body.phone,
      reference: body.reference,
      description: body.description,
      requestId: ctx.requestId,
    };
    const result = type === "TRANSFER" ? await provider.createTransfer(input) : await provider.createPayment(input);
    if (ctx.environment === "LIVE") {
      await logProviderCall({ providerCode, operation: type === "TRANSFER" ? "createTransfer" : "createPayment", requestId: ctx.requestId, success: true, responseMs: Date.now() - started });
    }
    const status = fromProviderStatus(result.status);
    const updated =
      status === "PENDING"
        ? await prisma.transaction.update({ where: { id: created.id }, data: { providerTransactionId: result.providerTransactionId } })
        : await recordStatus(created, status, "provider", { provider_transaction_id: result.providerTransactionId }, {
            providerTransactionId: result.providerTransactionId,
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

export async function getTransaction(clientId: string, environment: ApiEnvironment, id: string, network?: Network) {
  const t = await prisma.transaction.findFirst({ where: { id, clientId, environment, ...(network ? { provider: network } : {}) } });
  if (!t) throw new AppError("TRANSACTION_NOT_FOUND", "Transaction not found.");
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

// "Balance" for a client is what HaitiPay holds for them on a network: what
// they've collected from completed payments, less fees, less what they've sent
// out (or reserved for pending transfers). It never exposes the platform's own
// provider wallet, which belongs to the operator.
export async function getCollectedBalance(clientId: string, environment: ApiEnvironment, network: Network) {
  const groups = await prisma.transaction.groupBy({
    by: ["currency", "type", "status"],
    where: { clientId, environment, provider: network, status: { in: ["PENDING", "PROCESSING", "COMPLETED"] } },
    _sum: { amount: true, feeAmount: true },
  });
  const byCurrency = new Map<string, { collected: Prisma.Decimal; fees: Prisma.Decimal; sent: Prisma.Decimal; sentFees: Prisma.Decimal }>();
  for (const g of groups) {
    const row = byCurrency.get(g.currency) ?? { collected: new Prisma.Decimal(0), fees: new Prisma.Decimal(0), sent: new Prisma.Decimal(0), sentFees: new Prisma.Decimal(0) };
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
    sent: r.sent.toNumber(),
    transfer_fees: r.sentFees.toNumber(),
    available: r.collected.minus(r.fees).minus(r.sent).minus(r.sentFees).toNumber(),
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
