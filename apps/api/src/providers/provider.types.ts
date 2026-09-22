import { Currency, PaymentProvider } from "@ayitipay/shared";

export interface DecryptedCredentials {
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
  baseUrl?: string;
}

export interface CreatePaymentParams {
  amount: number;
  currency: Currency;
  reference: string;
  description?: string;
}

export interface CreatePaymentResult {
  providerPaymentId: string;
  checkoutUrl: string;
  raw?: unknown;
}

export interface PaymentStatusResult {
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  raw?: unknown;
}

export interface NormalizedWebhookEvent {
  providerPaymentId: string;
  status: "SUCCEEDED" | "FAILED" | "CANCELLED";
  amount: number;
  currency: Currency;
  raw: unknown;
}

export interface RefundResult {
  refundId: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
}

// `credentials === null` means "no live credentials on file for this
// application/provider" — callers use this to route to the mock adapter for
// TEST-mode keys, or to reject LIVE-mode requests with PROVIDER_NOT_CONFIGURED.
export interface PaymentProviderAdapter {
  provider: PaymentProvider;
  createPayment(params: CreatePaymentParams, credentials: DecryptedCredentials | null): Promise<CreatePaymentResult>;
  getPaymentStatus(providerPaymentId: string, credentials: DecryptedCredentials | null): Promise<PaymentStatusResult>;
  verifyWebhookSignature(rawBody: string, signature: string | undefined | null, credentials: DecryptedCredentials): boolean;
  parseWebhookPayload(body: Record<string, unknown>): NormalizedWebhookEvent;
  refund?(providerPaymentId: string, amount: number | undefined, credentials: DecryptedCredentials): Promise<RefundResult>;
}
