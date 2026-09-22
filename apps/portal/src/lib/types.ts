import { KeyMode, PaymentProvider, WebhookDeliveryStatus } from "@ayitipay/shared";

export interface Application {
  id: string;
  name: string;
  feeBps: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeySummary {
  id: string;
  mode: KeyMode;
  label: string | null;
  keyPrefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface IssuedApiKey extends ApiKeySummary {
  fullToken: string;
}

export interface ProviderCredentialSummary {
  id: string;
  provider: PaymentProvider;
  baseUrl: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEndpoint {
  id: string;
  applicationId: string;
  url: string;
  secret: string;
  active: boolean;
  createdAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookEndpointId: string;
  transactionId: string;
  eventType: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  responseStatus: number | null;
  createdAt: string;
  lastAttemptAt: string | null;
}

export interface LedgerEntry {
  id: string;
  applicationId: string;
  transactionId: string;
  feeAmount: string;
  feeCurrency: string;
  feeBps: number;
  createdAt: string;
  transaction: { reference: string; provider: PaymentProvider };
}
