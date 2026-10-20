import { verifyProviderWebhook } from "../src/providers/live.webhook";
import { signHmac } from "../src/utils/hmac";

describe("provider webhook signature verification", () => {
  const secret = "provider-test-webhook-secret";
  const body = JSON.stringify({ orderId: "order_123", status: "paid" });
  const timestamp = "1792470000";
  const eventId = "evt_123";

  function headersFor(ts = timestamp, id = eventId, raw = body, key = secret) {
    const signature = signHmac(key, `${ts}.${id}.${raw}`);
    return {
      "x-moncash-signature": `v1=${signature}`,
      "x-moncash-timestamp": ts,
      "x-moncash-event-id": id,
    };
  }

  it("accepts a valid recent signature and returns the event id", () => {
    const nowMs = Number(timestamp) * 1000;
    expect(verifyProviderWebhook(headersFor(), body, secret, nowMs)).toEqual({
      ok: true,
      eventId,
    });
  });

  it("rejects a modified body", () => {
    const nowMs = Number(timestamp) * 1000;
    expect(verifyProviderWebhook(headersFor(), body + " ", secret, nowMs).ok).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    const nowMs = Number(timestamp) * 1000;
    expect(verifyProviderWebhook(headersFor(), body, "wrong-secret", nowMs).ok).toBe(false);
  });

  it("rejects stale timestamps", () => {
    const staleTimestamp = String(Number(timestamp) - 11 * 60);
    const nowMs = Number(timestamp) * 1000;
    expect(verifyProviderWebhook(headersFor(staleTimestamp), body, secret, nowMs).ok).toBe(false);
  });

  it("fails closed when the secret or required headers are missing", () => {
    const nowMs = Number(timestamp) * 1000;
    expect(verifyProviderWebhook(headersFor(), body, "", nowMs).ok).toBe(false);
    expect(verifyProviderWebhook({} as NodeJS.Dict<string>, body, secret, nowMs).ok).toBe(false);
  });

  it("rejects an empty body", () => {
    const nowMs = Number(timestamp) * 1000;
    expect(verifyProviderWebhook(headersFor(), "", secret, nowMs).ok).toBe(false);
  });
});
