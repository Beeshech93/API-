import { z } from "zod";
import { PERMISSIONS } from "@/services/apikey.service";
import { WEBHOOK_EVENTS } from "@/services/webhook.service";

export const signupSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(10, "Password must be at least 10 characters.").max(72),
  name: z.string().trim().min(1).max(120),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(72),
});

export const createKeySchema = z.object({
  name: z.string().trim().min(1).max(80),
  environment: z.enum(["TEST", "LIVE"]),
  permissions: z.array(z.enum(PERMISSIONS)).min(1),
});

// Haitian numbers: country code 509 + 8 digits. Accepts "+509 3xxx-xxxx" style input.
const phone = z
  .string()
  .transform((v) => v.replace(/[\s()+-]/g, ""))
  .refine((v) => /^509\d{8}$/.test(v), "Phone must be a Haitian number in the format 509XXXXXXXX.");

export const createPaymentSchema = z.object({
  amount: z.number({ invalid_type_error: "Amount must be a number." }).positive("Amount must be positive."),
  currency: z.enum(["HTG", "USD"]),
  phone,
  reference: z.string().trim().max(100).optional(),
  description: z.string().trim().max(200).optional(),
});

export const idempotencyKeySchema = z
  .string({ required_error: "The Idempotency-Key header is required for this operation." })
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9_\-:.]+$/, "Idempotency-Key may only contain letters, digits and _ - : .");

export const quoteQuerySchema = z.object({
  amount: z.coerce.number().positive(),
  currency: z.enum(["HTG", "USD"]),
  provider: z.enum(["moncash", "natcash"]),
});

export const simulateSchema = z.object({ outcome: z.enum(["completed", "failed"]) });

export const createWebhookSchema = z.object({
  url: z.string().url().max(500),
  events: z.array(z.enum(WEBHOOK_EVENTS)).optional(),
});

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(["pending", "processing", "completed", "failed", "cancelled"]).optional(),
  before: z.string().datetime().optional(),
  environment: z.enum(["test", "live"]).optional(),
});
