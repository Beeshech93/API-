import crypto from "crypto";
import { ApiEnvironment, Network, Prisma, Transaction, TransactionStatus } from "@prisma/client";
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

const EVENT_BY_STATUS: Record<TransactionStatus, WebhookEvent | null> = {
  PENDING: "payment.pending",
  PROCESSING: "payment.processing",
  COMPLETED: "payment.completed",
  FAILED: "payment.failed",
  CANCELLED: null,
};

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

const fingerprint = (network: Network, body: CreatePaymentBody) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify([network, body.amount, body.currency, body.phone, body.reference ?? null, body.description ?? null]))
    .digest("hex");

async function recordStatus(t: Transaction, status: TransactionStatus, source: string, raw: Record<string, unknown>, extra: Partial<Prisma.TransactionUpdateInput> = {}) {
  const updated = await prisma.transaction.update({ where: { id: t.id }, data: { status, ...extra } });
  await prisma.transactionEvent.create({ data: { transactionId: t.id, status, source, rawPayload: raw as Prisma.InputJsonValue } });
  const event = EVENT_BY_STATUS[status];
  if (event) {
    await enqueueEvent(t.clientId, t.id, event, {
      transaction_id: t.id,
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

export async function createPayment(
  ctx: KeyContext,
  network: Network,
  body: CreatePaymentBody,
  idempotencyKey: string
): Promise<{ transaction: Transaction; replayed: boolean }> {
  const config = await getFeeConfig();
  assertAmountInRange(body.amount, body.currency, config);

  const print = fingerprint(network, body);
  const findExisting = () =>
    prisma.transaction.findFirst({ where: { clientId: ctx.clientId, environment: ctx.environment, idempotencyKey } });

  const existing = await findExisting();
  if (existing) return replay(existing, print);

  const entitlements = await getEntitlements(ctx.clientId);
  const quote = computeQuote(body.amount, body.currency, config, entitlements.transactionFeeBps);

  let created: Transaction;
  try {
    created = await prisma.transaction.create({
      data: {
        id: newTransactionId(),
        clientId: ctx.clientId,
        apiKeyId: ctx.apiKeyId,
        environment: ctx.environment,
        provider: network,
        type: "PAYMENT",
        amount: body.amount,
        currency: body.currency,
        feeAmount: quote.fee,
        totalAmount: quote.total,
        phone: body.phone,
        externalReference: body.reference,
        description: body.description,
        status: "PENDING",
        requestId: ctx.requestId,
        idempotencyKey,
        requestFingerprint: print,
      },
    });
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
  await enqueueEvent(ctx.clientId, created.id, "payment.pending", {
    transaction_id: created.id, amount: body.amount, currency: body.currency, provider: network.toLowerCase(),
    status: "pending", reference: body.reference ?? null, request_id: ctx.requestId, created_at: new Date().toISOString(),
  });

  const providerCode = network.toLowerCase();
  const started = Date.now();
  try {
    const result = await getProvider(ctx.environment).createPayment({
      network: network as NetworkCode,
      amount: body.amount,
      currency: body.currency,
      phone: body.phone,
      reference: body.reference,
      description: body.description,
      requestId: ctx.requestId,
    });
    if (ctx.environment === "LIVE") {
      await logProviderCall({ providerCode, operation: "createPayment", requestId: ctx.requestId, success: true, responseMs: Date.now() - started });
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
      await logProviderCall({ providerCode, operation: "createPayment", requestId: ctx.requestId, success: false, responseMs: Date.now() - started, errorCode: appError.code, errorMessage: appError.message });
    }
    // A timeout leaves the real outcome unknown (money may have moved), so it
    // stays PROCESSING for reconciliation instead of being marked FAILED.
    const unknown = appError.code === "PROVIDER_TIMEOUT";
    await recordStatus(created, unknown ? "PROCESSING" : "FAILED", "provider", { error: appError.code }, {
      errorCode: appError.code,
      errorMessage: appError.message,
    });
    await pollOnce().catch(() => undefined);
    throw appError;
  }
}

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
  filters: { network?: Network; status?: TransactionStatus; limit: number; before?: Date }
) {
  const rows = await prisma.transaction.findMany({
    where: {
      clientId,
      ...(environment ? { environment } : {}),
      ...(filters.network ? { provider: filters.network } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.before ? { createdAt: { lt: filters.before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: filters.limit,
  });
  return rows;
}

// "Balance" for a client is what HaitiPay has collected for them on that
// network — the sum of their completed payments — never the platform's own
// provider wallet, which belongs to the operator and must not be exposed.
export async function getCollectedBalance(clientId: string, environment: ApiEnvironment, network: Network) {
  const groups = await prisma.transaction.groupBy({
    by: ["currency"],
    where: { clientId, environment, provider: network, type: "PAYMENT", status: "COMPLETED" },
    _sum: { amount: true, feeAmount: true },
  });
  return groups.map((g) => {
    const collected = Number(g._sum.amount ?? 0);
    const fees = Number(g._sum.feeAmount ?? 0);
    return { currency: g.currency, collected, fees, net: Math.round((collected - fees) * 100) / 100 };
  });
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
