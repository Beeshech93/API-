import { env, isBazikConfigured } from "@/config/env";
import { AppError } from "@/utils/errors";
import {
  CreateProviderPaymentInput,
  NetworkCode,
  PaymentProviderClient,
  ProviderBalance,
  ProviderHealth,
  ProviderPayment,
} from "@/providers/provider.types";

// LIVE integration with Bazik. The real Bazik API contract (endpoints, auth
// scheme, payloads, webhook signature) has not been confirmed from official
// documentation, and inventing endpoints for a payment provider is unsafe, so
// every operation fails closed with a clear PROVIDER_ERROR until it is wired up.
// Credentials come only from backend env vars (BAZIK_API_URL / BAZIK_API_KEY /
// BAZIK_SECRET_KEY) and are never logged, stored or returned.
//
// TODO(bazik-live): implement each method from Bazik's official docs, keeping
// this class the only place that knows about Bazik.
export class BazikService implements PaymentProviderClient {
  private notReady(operation: string): never {
    if (!isBazikConfigured()) {
      throw new AppError("PROVIDER_ERROR", "The payment provider is not configured on this platform.");
    }
    throw new AppError(
      "PROVIDER_ERROR",
      `Live provider operation "${operation}" is not available yet — the Bazik integration is pending confirmation of its official API.`
    );
  }

  async createPayment(_input: CreateProviderPaymentInput): Promise<ProviderPayment> {
    return this.notReady("createPayment");
  }

  async getPayment(_network: NetworkCode, _providerTransactionId: string): Promise<ProviderPayment> {
    return this.notReady("getPayment");
  }

  async getBalance(_network: NetworkCode): Promise<ProviderBalance> {
    return this.notReady("getBalance");
  }

  async healthCheck(): Promise<ProviderHealth> {
    const started = Date.now();
    if (!isBazikConfigured()) {
      return { ok: false, responseMs: Date.now() - started, message: "Bazik credentials are not configured" };
    }
    // Configured, but there is no confirmed health endpoint to call yet.
    return { ok: false, responseMs: Date.now() - started, message: `Bazik configured (${new URL(env.bazik.apiUrl).host}); live calls not implemented` };
  }
}
