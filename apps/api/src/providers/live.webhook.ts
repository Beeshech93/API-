import { IncomingHttpHeaders } from "http";
import { safeEqual, signHmac } from "@/utils/hmac";

// Verification of the notifications the payment provider POSTs to us.
//
// The provider signs every notification with HMAC-SHA256 over
// `<timestamp>.<eventId>.<rawBody>` using the webhook secret an administrator
// stored, and sends `v1=<hex>` in a `<prefix>-signature` header next to
// `<prefix>-timestamp` and `<prefix>-event-id`. The prefix is discovered from
// the headers themselves, so no provider name has to live in this code.

const TOLERANCE_SECONDS = 10 * 60;
const SIGNATURE_HEADER = /^x-(?!haitipay-)([a-z0-9]+)-signature$/;

export interface WebhookVerification {
  ok: boolean;
  eventId?: string;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// `secret` may be several: payments and transfers can be signed by different accounts.
export function verifyProviderWebhook(headers: IncomingHttpHeaders, rawBody: string, secret: string | string[], nowMs = Date.now()): WebhookVerification {
  const secrets = (Array.isArray(secret) ? secret : [secret]).filter(Boolean);
  // Fail closed when no secret is configured.
  if (!secrets.length || !rawBody) return { ok: false };

  const signatureKey = Object.keys(headers).find((k) => SIGNATURE_HEADER.test(k));
  if (!signatureKey) return { ok: false };
  const prefix = signatureKey.slice(0, -"signature".length);
  const signature = first(headers[signatureKey]);
  const timestamp = first(headers[`${prefix}timestamp`]);
  const eventId = first(headers[`${prefix}event-id`]);
  if (!signature || !timestamp || !eventId) return { ok: false };

  let ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false };
  if (ts > 1e12) ts = Math.floor(ts / 1000); // milliseconds
  if (Math.abs(nowMs / 1000 - ts) > TOLERANCE_SECONDS) return { ok: false };

  const given = signature.trim().replace(/^v1=/, "");
  const verified = secrets.some((s) => safeEqual(signHmac(s, `${timestamp}.${eventId}.${rawBody}`), given));
  return verified ? { ok: true, eventId } : { ok: false };
}
