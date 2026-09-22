import crypto from "crypto";
import { KeyMode } from "@ayitipay/shared";

const PREFIX_LENGTH = 12;

export interface GeneratedApiKey {
  fullToken: string;
  keyPrefix: string;
  hashedSecret: string;
}

// API keys are high-entropy random tokens, not low-entropy user passwords, so
// a fast deterministic hash (sha256) + prefix index is the standard pattern
// (mirrors Stripe/GitHub) rather than a slow password hash like bcrypt.
export function generateApiKey(mode: KeyMode): GeneratedApiKey {
  const modeTag = mode === "TEST" ? "test" : "live";
  const random = crypto.randomBytes(24).toString("base64url");
  const fullToken = `pay_${modeTag}_${random}`;
  const keyPrefix = fullToken.slice(0, `pay_${modeTag}_`.length + PREFIX_LENGTH);
  const hashedSecret = hashApiKey(fullToken);
  return { fullToken, keyPrefix, hashedSecret };
}

export function hashApiKey(fullToken: string): string {
  return crypto.createHash("sha256").update(fullToken).digest("hex");
}

export function verifyApiKey(fullToken: string, hashedSecret: string): boolean {
  const candidate = Buffer.from(hashApiKey(fullToken), "utf8");
  const expected = Buffer.from(hashedSecret, "utf8");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

export function extractKeyPrefix(fullToken: string): string {
  const match = fullToken.match(/^pay_(test|live)_/);
  if (!match) throw new Error("Malformed API key");
  return fullToken.slice(0, match[0].length + PREFIX_LENGTH);
}

export function modeFromToken(fullToken: string): KeyMode | null {
  if (fullToken.startsWith("pay_test_")) return "TEST";
  if (fullToken.startsWith("pay_live_")) return "LIVE";
  return null;
}
