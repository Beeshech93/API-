import crypto from "crypto";

export function signHmac(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function verifyHmac(secret: string, payload: string, signature: string | undefined | null): boolean {
  if (!signature) return false;
  return safeEqual(signHmac(secret, payload), signature);
}

// Outbound webhook signature, sent as `X-HaitiPay-Signature: t=<unix>,v1=<hex>`.
// The timestamp is part of the signed payload so receivers can reject replays.
export function buildSignatureHeader(secret: string, rawBody: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  return `t=${timestamp},v1=${signHmac(secret, `${timestamp}.${rawBody}`)}`;
}
