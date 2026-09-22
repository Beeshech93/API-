import { Currency, KeyMode, PaymentProvider, TransactionStatus } from "./enums";

export interface TransactionDto {
  id: string;
  status: TransactionStatus;
  provider: PaymentProvider;
  amount: number;
  currency: Currency;
  reference: string;
  description?: string | null;
  providerPaymentId?: string | null;
  checkoutUrl?: string | null;
  mode: KeyMode;
  createdAt: string;
  updatedAt: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export interface CreatePaymentRequest {
  provider: PaymentProvider;
  amount: number;
  currency: Currency;
  reference: string;
  description?: string;
}

export interface SimulatePaymentRequest {
  outcome: "success" | "failure";
}
