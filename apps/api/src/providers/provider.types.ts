export type NetworkCode = "MONCASH" | "NATCASH";
export type ProviderTxStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface CreateProviderPaymentInput {
  network: NetworkCode;
  amount: number;
  currency: "HTG" | "USD";
  phone: string;
  reference?: string;
  description?: string;
  requestId: string;
}

export interface ProviderPayment {
  providerTransactionId: string;
  status: ProviderTxStatus;
  errorCode?: string;
  errorMessage?: string;
}

export interface ProviderBalance {
  available: number;
  currency: "HTG" | "USD";
}

export interface ProviderHealth {
  ok: boolean;
  responseMs: number;
  message?: string;
}

// The single seam between HaitiPay's public API and whichever integrator moves
// the money. PaymentService only ever talks to this interface, so the provider can be
// swapped for another provider without touching the public API.
export interface PaymentProviderClient {
  createPayment(input: CreateProviderPaymentInput): Promise<ProviderPayment>;
  // Sends money out to a phone number (payout). Same result shape as a payment.
  createTransfer(input: CreateProviderPaymentInput): Promise<ProviderPayment>;
  getPayment(network: NetworkCode, providerTransactionId: string): Promise<ProviderPayment>;
  getBalance(network: NetworkCode): Promise<ProviderBalance>;
  healthCheck(): Promise<ProviderHealth>;
}
