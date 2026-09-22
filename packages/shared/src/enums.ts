export const PAYMENT_PROVIDERS = ["MONCASH", "NATCASH"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const CURRENCIES = ["HTG", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const KEY_MODES = ["TEST", "LIVE"] as const;
export type KeyMode = (typeof KEY_MODES)[number];

export const TRANSACTION_STATUSES = [
  "PENDING",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const WEBHOOK_DELIVERY_STATUSES = ["PENDING", "SUCCEEDED", "FAILED", "EXHAUSTED"] as const;
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];
