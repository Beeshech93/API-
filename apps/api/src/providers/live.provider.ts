import { env, isProviderConfigured } from "@/config/env";
import { AppError } from "@/utils/errors";
import {
  CreateProviderPaymentInput,
  NetworkCode,
  PaymentProviderClient,
  ProviderBalance,
  ProviderHealth,
  ProviderPayment,
} from "@/providers/provider.types";

// LIVE integration with the payment integrator. Its real API contract
// (endpoints, auth scheme, payloads, webhook signature) has not been confirmed
// from official documentation, and inventing endpoints for a payment provider is
// unsafe, so every operation fails closed with a clear PROVIDER_ERROR until it is
// wired up. Credentials come only from backend env vars (PROVIDER_API_URL /
// PROVIDER_API_KEY / PROVIDER_SECRET_KEY) and are never logged, stored or returned.
//
// Messages thrown from here can reach API clients, so they never name the
// provider — its identity is only ever shown to administrators.
//
// TODO(live-provider): implement each method from the provider's official docs,
// keeping this class the only place that knows about it.
export class LiveProvider implements PaymentProviderClient {
  private notReady(): never {
    if (!isProviderConfigured()) {
      throw new AppError("PROVIDER_ERROR", "Live payment processing is not configured on this platform yet.");
    }
    throw new AppError("PROVIDER_ERROR", "Live payment processing is not available yet.");
  }

  async createPayment(_input: CreateProviderPaymentInput): Promise<ProviderPayment> {
    return this.notReady();
  }

  async getPayment(_network: NetworkCode, _providerTransactionId: string): Promise<ProviderPayment> {
    return this.notReady();
  }

  async getBalance(_network: NetworkCode): Promise<ProviderBalance> {
    return this.notReady();
  }

  // The result is only ever surfaced through the admin API.
  async healthCheck(): Promise<ProviderHealth> {
    const started = Date.now();
    if (!isProviderConfigured()) {
      return { ok: false, responseMs: Date.now() - started, message: `${env.provider.name} credentials are not configured` };
    }
    return { ok: false, responseMs: Date.now() - started, message: `${env.provider.name} configured (${new URL(env.provider.apiUrl).host}); live calls not implemented` };
  }
}
