import crypto from "crypto";
import { Currency, PaymentProvider } from "@ayitipay/shared";
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

// Deliberately stateless: this module used to keep an in-memory Map of mock
// payments, but that breaks the moment "create" and "simulate" land on
// different processes/instances (e.g. two separate serverless invocations on
// Vercel) — the second call would find no record and fail. The `Transaction`
// row in Postgres is always the real source of truth for a payment's state,
// so the mock adapter never needs its own store: callers pass back whatever
// they already have on the transaction (amount/currency) instead of the
// adapter having to remember it.
export function createMockPayment(provider: PaymentProvider, params: CreatePaymentParams): CreatePaymentResult {
  const providerPaymentId = `mock_${provider.toLowerCase()}_${crypto.randomUUID()}`;
  return {
    providerPaymentId,
    checkoutUrl: `${process.env.PORTAL_APP_URL ?? "http://localhost:3000"}/sandbox/checkout/${providerPaymentId}`,
    raw: { mock: true },
  };
}

// The mock adapter itself never tracks post-creation status — the owning
// `Transaction` row does. This always reports PENDING, which is correct
// (and unused in the request flow: only `GET /v1/payments/:id`, backed by
// the DB, is ever consulted for status).
export function getMockPaymentStatus(): PaymentStatusResult {
  return { status: "PENDING", raw: { mock: true } };
}

export function settleMockPayment(
  providerPaymentId: string,
  amount: number,
  currency: Currency,
  outcome: "success" | "failure"
): NormalizedWebhookEvent {
  return {
    providerPaymentId,
    status: outcome === "success" ? "SUCCEEDED" : "FAILED",
    amount,
    currency,
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
