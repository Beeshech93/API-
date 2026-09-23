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
  // Our own transaction id; sent to the provider as the reference so every
  // provider-side record can be traced back to it.
  transactionId: string;
  // Payments: where the payer returns to after the hosted payment page.
  successUrl?: string;
  errorUrl?: string;
  // Transfers: who receives the money.
  recipient?: { firstName: string; lastName: string };
}

// What can be checked about a request before any money is reserved.
export type ProviderOperation = "PAYMENT" | "TRANSFER";
export type ProviderPrecheckInput = Omit<CreateProviderPaymentInput, "transactionId">;

export interface ProviderPayment {
  providerTransactionId: string;
  status: ProviderTxStatus;
  errorCode?: string;
  errorMessage?: string;
  // Hosted page where the payer completes a payment (LIVE payments only).
  redirectUrl?: string;
  // Amount the provider has on record, when it reports one; used to make sure
  // a payment is never completed for a different amount than requested.
  amount?: number;
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
  // Rejects, before anything is created or reserved, requests the provider
  // could not carry out (unsupported network/currency, missing recipient...).
  validate?(type: ProviderOperation, input: ProviderPrecheckInput): Promise<void>;
  createPayment(input: CreateProviderPaymentInput): Promise<ProviderPayment>;
  // Sends money out to a phone number (payout). Same result shape as a payment.
  createTransfer(input: CreateProviderPaymentInput): Promise<ProviderPayment>;
  getPayment(network: NetworkCode, providerTransactionId: string): Promise<ProviderPayment>;
  getBalance(network: NetworkCode): Promise<ProviderBalance>;
  healthCheck(): Promise<ProviderHealth>;
}
