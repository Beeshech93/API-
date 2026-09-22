import { z } from "zod";
import { CURRENCIES, PAYMENT_PROVIDERS } from "@ayitipay/shared";

export const createPaymentSchema = z.object({
  provider: z.enum(PAYMENT_PROVIDERS),
  amount: z.number().positive(),
  currency: z.enum(CURRENCIES),
  reference: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
});

export const simulatePaymentSchema = z.object({
  outcome: z.enum(["success", "failure"]),
});
