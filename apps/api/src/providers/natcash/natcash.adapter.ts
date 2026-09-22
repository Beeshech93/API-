import { AppError } from "@/utils/errors";
import { verifyHmac } from "@/utils/hmac";
import * as mock from "@/providers/mockTransport";
import {
  CreatePaymentParams,
  DecryptedCredentials,
  PaymentProviderAdapter,
} from "@/providers/provider.types";

// NatCash (Natcom) live integration is intentionally unimplemented: no
// official API documentation or sandbox credentials were available to verify
// the real contract in this environment. Do not invent endpoints — confirm
// against Natcom's official NatCash merchant/developer documentation before
// filling these in. Auth flow, create-payment fields, status endpoint, and
// webhook payload/signature scheme are all unconfirmed.
export const natCashAdapter: PaymentProviderAdapter = {
  provider: "NATCASH",

  async createPayment(params: CreatePaymentParams, credentials: DecryptedCredentials | null) {
    if (!credentials) return mock.createMockPayment("NATCASH", params);
    throw AppError.badRequest(
      "NatCash live integration is not implemented yet — the real API contract must be confirmed from Natcom's official docs first.",
      "PROVIDER_NOT_CONFIGURED"
    );
  },

  async getPaymentStatus(_providerPaymentId: string, credentials: DecryptedCredentials | null) {
    if (!credentials) return mock.getMockPaymentStatus();
    throw AppError.badRequest("NatCash live integration is not implemented yet.", "PROVIDER_NOT_CONFIGURED");
  },

  verifyWebhookSignature(rawBody: string, signature: string | undefined | null, credentials: DecryptedCredentials) {
    // TODO(natcash-live): placeholder HMAC check — replace with NatCash's real
    // signature scheme once documented.
    return verifyHmac(credentials.webhookSecret, rawBody, signature);
  },

  parseWebhookPayload(body: Record<string, unknown>) {
    // TODO(natcash-live): remap field names once the real NatCash webhook payload is documented.
    return mock.parseMockWebhookPayload(body);
  },
};
