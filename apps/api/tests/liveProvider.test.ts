import { signHmac } from "@/utils/hmac";
import { verifyProviderWebhook } from "@/providers/live.webhook";
import { mapProviderStatus, toWallet } from "@/providers/live.provider";

jest.mock("@/services/providerConfig.service", () => ({
  getEffectiveConfig: jest.fn(async () => ({ name: "x", apiUrl: "", apiKey: "", secretKey: "", webhookSecret: "", source: "none", configured: false })),
}));

const SECRET = "whsec_unit_test";
const body = JSON.stringify({ type: "payment.succeeded", orderId: "ord_1" });
const now = 1_800_000_000_000;

function headers(over: Record<string, string> = {}, prefix = "x-acme-") {
  const ts = String(Math.floor(now / 1000));
  const evt = "evt_1";
  return {
    [`${prefix}timestamp`]: ts,
    [`${prefix}event-id`]: evt,
    [`${prefix}signature`]: `v1=${signHmac(SECRET, `${ts}.${evt}.${body}`)}`,
    ...over,
  };
}

describe("provider webhook verification", () => {
  it("accepts a correctly signed notification, whatever the header prefix is", () => {
    expect(verifyProviderWebhook(headers(), body, SECRET, now).ok).toBe(true);
    expect(verifyProviderWebhook(headers({}, "x-other-"), body, SECRET, now).ok).toBe(true);
  });

  it("rejects a wrong secret, a tampered body and a missing signature", () => {
    expect(verifyProviderWebhook(headers(), body, "another-secret", now).ok).toBe(false);
    expect(verifyProviderWebhook(headers(), body.replace("ord_1", "ord_2"), SECRET, now).ok).toBe(false);
    const h = headers();
    delete (h as Record<string, string>)["x-acme-signature"];
    expect(verifyProviderWebhook(h, body, SECRET, now).ok).toBe(false);
  });

  it("rejects stale (replayed) and malformed timestamps", () => {
    expect(verifyProviderWebhook(headers(), body, SECRET, now + 3600_000).ok).toBe(false);
    expect(verifyProviderWebhook(headers({ "x-acme-timestamp": "yesterday" }), body, SECRET, now).ok).toBe(false);
  });

  it("fails closed without a configured secret or body", () => {
    expect(verifyProviderWebhook(headers(), body, "", now).ok).toBe(false);
    expect(verifyProviderWebhook(headers(), "", SECRET, now).ok).toBe(false);
  });

  it("never treats our own outbound signature header as the provider's", () => {
    const h = { "x-haitipay-signature": "v1=abc", "x-haitipay-timestamp": "1", "x-haitipay-event-id": "e" };
    expect(verifyProviderWebhook(h, body, SECRET, now).ok).toBe(false);
  });
});

describe("provider status mapping", () => {
  it("only reports COMPLETED for an explicit success", () => {
    expect(mapProviderStatus("successful")).toBe("COMPLETED");
    expect(mapProviderStatus("completed")).toBe("COMPLETED");
    expect(mapProviderStatus("failed")).toBe("FAILED");
    expect(mapProviderStatus("cancelled")).toBe("CANCELLED");
  });

  it("treats anything unknown as still pending, never as money moved", () => {
    expect(mapProviderStatus("pending")).toBe("PENDING");
    expect(mapProviderStatus(undefined)).toBe("PENDING");
    expect(mapProviderStatus("something-new")).toBe("PENDING");
  });
});

describe("recipient wallet", () => {
  it("strips the country code", () => {
    expect(toWallet("50937123456")).toBe("37123456");
    expect(toWallet("37123456")).toBe("37123456");
  });
});
