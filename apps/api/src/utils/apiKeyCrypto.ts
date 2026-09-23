import crypto from "crypto";
import { safeEqual } from "@/utils/hmac";

export type KeyEnvironment = "TEST" | "LIVE";

const PREFIX_RANDOM_LENGTH = 8;

export interface GeneratedApiKey {
  fullToken: string;
  keyPrefix: string;
  last4: string;
  hashedSecret: string;
}

// API keys are high-entropy random tokens, so a fast deterministic hash plus a
// prefix index is the right storage pattern (unlike low-entropy passwords).
// Format: hp_live_<random> / hp_test_<random>. Only the hash, an indexed prefix
// and the last 4 characters are ever stored.
export function generateApiKey(environment: KeyEnvironment): GeneratedApiKey {
  const tag = environment === "LIVE" ? "live" : "test";
  const random = crypto.randomBytes(24).toString("base64url");
  const fullToken = `hp_${tag}_${random}`;
  return {
    fullToken,
    keyPrefix: fullToken.slice(0, `hp_${tag}_`.length + PREFIX_RANDOM_LENGTH),
    last4: fullToken.slice(-4),
    hashedSecret: hashApiKey(fullToken),
  };
}

export function hashApiKey(fullToken: string): string {
  return crypto.createHash("sha256").update(fullToken).digest("hex");
}

export function verifyApiKey(fullToken: string, hashedSecret: string): boolean {
  return safeEqual(hashApiKey(fullToken), hashedSecret);
}

export function extractKeyPrefix(fullToken: string): string | null {
  const match = fullToken.match(/^hp_(test|live)_/);
  if (!match) return null;
  const prefix = fullToken.slice(0, match[0].length + PREFIX_RANDOM_LENGTH);
  return prefix.length === match[0].length + PREFIX_RANDOM_LENGTH ? prefix : null;
}

// What the dashboard shows after creation, e.g. hp_live_••••••••••••91KD.
export function maskApiKey(keyPrefix: string, last4: string): string {
  const environment = keyPrefix.startsWith("hp_live_") ? "hp_live_" : "hp_test_";
  return `${environment}${"•".repeat(12)}${last4}`;
}
