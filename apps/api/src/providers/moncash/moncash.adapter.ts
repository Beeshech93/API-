import { AppError } from "@/utils/errors";
import { verifyHmac } from "@/utils/hmac";
import * as mock from "@/providers/mockTransport";
import {
  CreatePaymentParams,
  DecryptedCredentials,
  PaymentProviderAdapter,
} from "@/providers/provider.types";

// MonCash (Digicel) live integration is intentionally unimplemented: no
// official API documentation or sandbox credentials were available to verify
// the real contract in this environment. Do not invent endpoints — confirm
// against Digicel's official MonCash merchant/developer documentation before
// filling these in. Expected shape to verify, NOT implemented:
//   - Auth: likely OAuth2 client-credentials against `credentials.baseUrl`
//   - POST {baseUrl}/Api/v1/CreatePayment  { amount, orderId } -> { redirect_url, token }
//   - GET  {baseUrl}/Api/v1/Payment/{token}
//   - Webhook payload/signature scheme: unconfirmed
export const monCashAdapter: PaymentProviderAdapter = {
  provider: "MONCASH",

  async createPayment(params: CreatePaymentParams, credentials: DecryptedCredentials | null) {
    if (!credentials) return mock.createMockPayment("MONCASH", params);
    throw AppError.badRequest(
      "MonCash live integration is not implemented yet — the real API contract must be confirmed from Digicel's official docs first.",
      "PROVIDER_NOT_CONFIGURED"
    );
  },

  async getPaymentStatus(providerPaymentId: string, credentials: DecryptedCredentials | null) {
    if (!credentials) return mock.getMockPaymentStatus(providerPaymentId);
    throw AppError.badRequest("MonCash live integration is not implemented yet.", "PROVIDER_NOT_CONFIGURED");
  },

  verifyWebhookSignature(rawBody: string, signature: string | undefined | null, credentials: DecryptedCredentials) {
    // TODO(moncash-live): placeholder HMAC-SHA256-over-raw-body check using the
    // developer's stored webhook secret. Replace with MonCash's real signature
    // scheme (header name, algorithm, canonicalization) once documented —
    // do not assume this placeholder matches what Digicel actually sends.
    return verifyHmac(credentials.webhookSecret, rawBody, signature);
  },

  parseWebhookPayload(body: Record<string, unknown>) {
    // TODO(moncash-live): remap field names once the real MonCash webhook payload is documented.
    return mock.parseMockWebhookPayload(body);
  },
};
