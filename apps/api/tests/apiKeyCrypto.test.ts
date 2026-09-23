import { extractKeyPrefix, generateApiKey, maskApiKey, verifyApiKey } from "@/utils/apiKeyCrypto";

describe("API key crypto", () => {
  it("generates hp_test_ / hp_live_ keys whose hash verifies", () => {
    const test = generateApiKey("TEST");
    const live = generateApiKey("LIVE");
    expect(test.fullToken).toMatch(/^hp_test_/);
    expect(live.fullToken).toMatch(/^hp_live_/);
    expect(verifyApiKey(live.fullToken, live.hashedSecret)).toBe(true);
    expect(verifyApiKey(live.fullToken + "x", live.hashedSecret)).toBe(false);
    expect(extractKeyPrefix(live.fullToken)).toBe(live.keyPrefix);
  });

  it("never stores the full key: only hash, prefix and last 4", () => {
    const key = generateApiKey("LIVE");
    expect(key.hashedSecret).not.toContain(key.fullToken);
    expect(key.last4).toBe(key.fullToken.slice(-4));
  });

  it("masks keys as hp_live_••••••••••••XXXX", () => {
    const key = generateApiKey("LIVE");
    const masked = maskApiKey(key.keyPrefix, key.last4);
    expect(masked).toBe(`hp_live_${"•".repeat(12)}${key.last4}`);
    expect(masked).not.toContain(key.fullToken.slice(8, 20));
  });

  it("rejects malformed keys", () => {
    expect(extractKeyPrefix("pay_test_abcdefghijkl")).toBeNull();
    expect(extractKeyPrefix("hp_live_short")).toBeNull();
  });
});
