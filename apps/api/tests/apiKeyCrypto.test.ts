import { extractKeyPrefix, generateApiKey, verifyApiKey } from "@/utils/apiKeyCrypto";

describe("apiKeyCrypto", () => {
  it("generates a key whose prefix and hash round-trip correctly", () => {
    const { fullToken, keyPrefix, hashedSecret } = generateApiKey("TEST");
    expect(fullToken).toMatch(/^pay_test_/);
    expect(extractKeyPrefix(fullToken)).toBe(keyPrefix);
    expect(verifyApiKey(fullToken, hashedSecret)).toBe(true);
    expect(verifyApiKey("pay_test_wrongtoken", hashedSecret)).toBe(false);
  });

  it("tags live keys distinctly from test keys", () => {
    const testKey = generateApiKey("TEST");
    const liveKey = generateApiKey("LIVE");
    expect(testKey.fullToken.startsWith("pay_test_")).toBe(true);
    expect(liveKey.fullToken.startsWith("pay_live_")).toBe(true);
  });
});
