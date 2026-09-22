import { z } from "zod";
import { KEY_MODES, PAYMENT_PROVIDERS } from "@ayitipay/shared";

export const createApplicationSchema = z.object({
  name: z.string().min(1).max(120),
});

export const issueApiKeySchema = z.object({
  mode: z.enum(KEY_MODES),
  label: z.string().max(80).optional(),
});

export const upsertCredentialSchema = z.object({
  provider: z.enum(PAYMENT_PROVIDERS),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  webhookSecret: z.string().min(1),
  baseUrl: z.string().url().optional(),
});

export const createWebhookEndpointSchema = z.object({
  url: z.string().url(),
});
