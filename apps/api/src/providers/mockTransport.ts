import crypto from "crypto";
import { PaymentProvider } from "@ayitipay/shared";
import { signHmac, verifyHmac } from "@/utils/hmac";
import {
  CreatePaymentParams,
  CreatePaymentResult,
  NormalizedWebhookEvent,
  PaymentStatusResult,
} from "@/providers/provider.types";

// Fixed, non-secret signing key used ONLY for the built-in sandbox/mock
// pipeline (never for real provider traffic) so the HMAC verification code
// path is exercised identically in mock and live modes.
const MOCK_WEBHOOK_SECRET = "ayitipay-mock-webhook-secret";

interface MockPaymentRecord {
  provider: PaymentProvider;
  amount: number;
  currency: CreatePaymentParams["currency"];
  reference: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
}

// Ephemeral, process-local store: fine for sandbox/dev use, not meant to
// survive restarts. Real transaction state of record always lives in the
// `Transaction` table; this only backs the mock provider's own status.
const mockPayments = new Map<string, MockPaymentRecord>();

export function createMockPayment(provider: PaymentProvider, params: CreatePaymentParams): CreatePaymentResult {
  const providerPaymentId = `mock_${provider.toLowerCase()}_${crypto.randomUUID()}`;
  mockPayments.set(providerPaymentId, {
    provider,
    amount: params.amount,
    currency: params.currency,
    reference: params.reference,
    status: "PENDING",
  });
  return {
    providerPaymentId,
    checkoutUrl: `${process.env.PORTAL_APP_URL ?? "http://localhost:3000"}/sandbox/checkout/${providerPaymentId}`,
    raw: { mock: true },
  };
}

export function getMockPaymentStatus(providerPaymentId: string): PaymentStatusResult {
  const record = mockPayments.get(providerPaymentId);
  if (!record) return { status: "FAILED", raw: { mock: true, reason: "unknown_payment_id" } };
  return { status: record.status, raw: { mock: true } };
}

export function settleMockPayment(providerPaymentId: string, outcome: "success" | "failure"): NormalizedWebhookEvent {
  const record = mockPayments.get(providerPaymentId);
  if (!record) throw new Error(`Unknown mock payment id: ${providerPaymentId}`);
  record.status = outcome === "success" ? "SUCCEEDED" : "FAILED";
  return {
    providerPaymentId,
    status: record.status,
    amount: record.amount,
    currency: record.currency,
    raw: { mock: true, outcome },
  };
}

export function buildSignedMockWebhook(event: NormalizedWebhookEvent): { body: string; signature: string } {
  const body = JSON.stringify({
    payment_id: event.providerPaymentId,
    status: event.status,
    amount: event.amount,
    currency: event.currency,
  });
  return { body, signature: signHmac(MOCK_WEBHOOK_SECRET, body) };
}

export function verifyMockWebhookSignature(rawBody: string, signature: string | undefined | null): boolean {
  return verifyHmac(MOCK_WEBHOOK_SECRET, rawBody, signature);
}

export function parseMockWebhookPayload(body: Record<string, unknown>): NormalizedWebhookEvent {
  return {
    providerPaymentId: String(body.payment_id ?? ""),
    status: (body.status as NormalizedWebhookEvent["status"]) ?? "FAILED",
    amount: Number(body.amount ?? 0),
    currency: (body.currency as NormalizedWebhookEvent["currency"]) ?? "HTG",
    raw: body,
  };
}
