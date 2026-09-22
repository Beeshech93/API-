import crypto from "crypto";

export function signHmac(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

// Constant-time compare guarding against length-based timing leaks: unequal
// lengths short-circuit to false instead of throwing/leaking via a crash.
export function verifyHmac(secret: string, payload: string, signature: string | undefined | null): boolean {
  if (!signature) return false;
  const expected = signHmac(secret, payload);
  const expectedBuf = Buffer.from(expected, "utf8");
  const signatureBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

// Stripe-style "t=<unix_ts>,v1=<hmac>" envelope for outbound webhook signing,
// so receivers can also reject stale/replayed deliveries by timestamp.
export function buildSignedWebhookHeader(secret: string, rawBody: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signHmac(secret, `${timestamp}.${rawBody}`);
  return `t=${timestamp},v1=${signature}`;
}

export function verifySignedWebhookHeader(secret: string, rawBody: string, header: string | undefined | null): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    })
  );
  if (!parts.t || !parts.v1) return false;
  return verifyHmac(secret, `${parts.t}.${rawBody}`, parts.v1);
}
