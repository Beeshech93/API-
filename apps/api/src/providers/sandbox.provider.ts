import crypto from "crypto";
import { AppError } from "@/utils/errors";
import {
  CreateProviderPaymentInput,
  NetworkCode,
  PaymentProviderClient,
  ProviderBalance,
  ProviderHealth,
  ProviderPayment,
} from "@/providers/provider.types";

// Simulated provider for TEST keys. It NEVER moves real money and never calls
// any external service. Behaviour is driven by the last digits of the phone:
//   ...0001  completes immediately
//   ...0002  fails (TRANSACTION_FAILED)
//   ...0003  rejects with INSUFFICIENT_BALANCE
//   ...0004  times out (PROVIDER_TIMEOUT)
//   others   stay PENDING until POST /api/v1/sandbox/transactions/:id/simulate
export const SANDBOX_TEST_NUMBERS = {
  completed: "50900000001",
  failed: "50900000002",
  insufficientBalance: "50900000003",
  timeout: "50900000004",
} as const;

export class SandboxProvider implements PaymentProviderClient {
  async createPayment(input: CreateProviderPaymentInput): Promise<ProviderPayment> {
    const providerTransactionId = `sbx_${input.network.toLowerCase()}_${crypto.randomBytes(8).toString("hex")}`;
    if (input.phone.endsWith("0003")) {
      throw new AppError("INSUFFICIENT_BALANCE", "Insufficient provider balance (sandbox test number)");
    }
    if (input.phone.endsWith("0004")) {
      throw new AppError("PROVIDER_TIMEOUT", "The provider did not respond in time (sandbox test number)");
    }
    if (input.phone.endsWith("0001")) return { providerTransactionId, status: "COMPLETED" };
    if (input.phone.endsWith("0002")) {
      return {
        providerTransactionId,
        status: "FAILED",
        errorCode: "TRANSACTION_FAILED",
        errorMessage: "Payment declined (sandbox test number)",
      };
    }
    return { providerTransactionId, status: "PENDING" };
  }

  // Status of record always lives in the transactions table; the sandbox keeps no state.
  async getPayment(_network: NetworkCode, providerTransactionId: string): Promise<ProviderPayment> {
    return { providerTransactionId, status: "PENDING" };
  }

  async getBalance(_network: NetworkCode): Promise<ProviderBalance> {
    return { available: 1_000_000, currency: "HTG" };
  }

  async healthCheck(): Promise<ProviderHealth> {
    return { ok: true, responseMs: 1, message: "sandbox" };
  }
}
