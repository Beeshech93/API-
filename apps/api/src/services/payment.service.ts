import { Transaction } from "@prisma/client";
import { CreatePaymentRequest, TransactionDto } from "@ayitipay/shared";
import { prisma } from "@/utils/prisma";
import { AppError } from "@/utils/errors";
import { getAdapter } from "@/providers/provider.factory";
import { getDecryptedCredentials } from "@/services/credential.service";
import { recordLedgerEntryOnce } from "@/services/ledger.service";
import { enqueueWebhookDeliveries } from "@/services/webhook.service";
import { settleMockPayment } from "@/providers/mockTransport";
import { ResolvedApiKey } from "@/services/apikey.service";
import { NormalizedWebhookEvent } from "@/providers/provider.types";

export function toTransactionDto(transaction: Transaction): TransactionDto {
  return {
    id: transaction.id,
    status: transaction.status,
    provider: transaction.provider,
    amount: Number(transaction.amount),
    currency: transaction.currency,
    reference: transaction.reference,
    description: transaction.description,
    providerPaymentId: transaction.providerPaymentId,
    checkoutUrl: transaction.checkoutUrl,
    mode: transaction.mode,
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
  };
}

export async function createPayment(
  apiKey: ResolvedApiKey,
  input: CreatePaymentRequest,
  idempotencyKey: string | undefined
): Promise<Transaction> {
  if (idempotencyKey) {
    const existing = await prisma.transaction.findFirst({
      where: { applicationId: apiKey.applicationId, idempotencyKey },
    });
    if (existing) return existing;
  }

  // LIVE keys must have real, developer-supplied credentials on file for the
  // requested provider — they are never silently routed to the mock adapter.
  // TEST keys always pass `null` credentials so they always hit the safe mock
  // path, even if the developer has already saved live credentials.
  const credentials =
    apiKey.mode === "LIVE" ? await getDecryptedCredentials(apiKey.applicationId, input.provider) : null;

  if (apiKey.mode === "LIVE" && !credentials) {
    throw AppError.badRequest(
      `No active ${input.provider} credentials on file for this application. Add them in the dashboard before creating live payments.`,
      "PROVIDER_NOT_CONFIGURED"
    );
  }

  const adapter = getAdapter(input.provider);
  const result = await adapter.createPayment(
    {
      amount: input.amount,
      currency: input.currency,
      reference: input.reference,
      description: input.description,
    },
    credentials
  );

  return prisma.transaction.create({
    data: {
      applicationId: apiKey.applicationId,
      apiKeyId: apiKey.id,
      mode: apiKey.mode,
      provider: input.provider,
      status: "PENDING",
      amount: input.amount,
      currency: input.currency,
      reference: input.reference,
      description: input.description,
      idempotencyKey,
      providerPaymentId: result.providerPaymentId,
      checkoutUrl: result.checkoutUrl,
    },
  });
}

export async function getPayment(applicationId: string, transactionId: string): Promise<Transaction> {
  const transaction = await prisma.transaction.findFirst({ where: { id: transactionId, applicationId } });
  if (!transaction) throw AppError.notFound("Payment not found.", "PAYMENT_NOT_FOUND");
  return transaction;
}

export async function listPayments(
  applicationId: string,
  filters: { status?: string; provider?: string }
) {
  return prisma.transaction.findMany({
    where: {
      applicationId,
      status: filters.status as never,
      provider: filters.provider as never,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

// Shared by both the inbound provider-webhook route and the sandbox
// `/simulate` endpoint: applies a normalized status event to a transaction,
// records the audit trail, settles the platform ledger fee exactly once on
// success, and fans the result out to the developer's own webhook endpoints.
export async function applyWebhookEvent(transaction: Transaction, event: NormalizedWebhookEvent, source: string) {
  const updated = await prisma.transaction.update({
    where: { id: transaction.id },
    data: { status: event.status },
  });

  await prisma.transactionEvent.create({
    data: {
      transactionId: transaction.id,
      status: event.status,
      rawPayload: event.raw as object,
      source,
    },
  });

  if (event.status === "SUCCEEDED") {
    const application = await prisma.application.findUniqueOrThrow({ where: { id: transaction.applicationId } });
    await recordLedgerEntryOnce({
      applicationId: transaction.applicationId,
      transactionId: transaction.id,
      amount: transaction.amount,
      currency: transaction.currency,
      feeBps: application.feeBps,
    });
  }

  await enqueueWebhookDeliveries(transaction.applicationId, transaction.id, toTransactionDto(updated));

  return updated;
}

export async function simulatePayment(
  apiKey: ResolvedApiKey,
  transactionId: string,
  outcome: "success" | "failure"
): Promise<Transaction> {
  if (apiKey.mode !== "TEST") {
    throw AppError.forbidden("Sandbox simulation is only available with a TEST API key.", "MODE_NOT_ALLOWED");
  }

  const transaction = await getPayment(apiKey.applicationId, transactionId);
  if (transaction.mode !== "TEST" || !transaction.providerPaymentId) {
    throw AppError.badRequest("This transaction cannot be simulated.", "NOT_SIMULATABLE");
  }

  const event = settleMockPayment(
    transaction.providerPaymentId,
    Number(transaction.amount),
    transaction.currency,
    outcome
  );
  return applyWebhookEvent(transaction, event, "sandbox_simulate");
}
