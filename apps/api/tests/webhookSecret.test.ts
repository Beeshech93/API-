import { decryptWebhookSecret, encryptWebhookSecret, isEncryptedWebhookSecret } from "../src/utils/webhookSecret";

describe("webhook secret storage", () => {
  it("encrypts secrets at rest and round-trips the original value", () => {
    const secret = "whsec_test-secret-that-must-not-be-stored-plain";
    const stored = encryptWebhookSecret(secret);

    expect(stored).toMatch(/^enc:v1:/);
    expect(stored).not.toContain(secret);
    expect(isEncryptedWebhookSecret(stored)).toBe(true);
    expect(decryptWebhookSecret(stored)).toBe(secret);
  });

  it("continues to read legacy plaintext secrets during migration", () => {
    const legacy = "whsec_legacy-secret";
    expect(isEncryptedWebhookSecret(legacy)).toBe(false);
    expect(decryptWebhookSecret(legacy)).toBe(legacy);
  });

  it("fails closed if encrypted data is corrupted", () => {
    const stored = encryptWebhookSecret("whsec_original-secret");
    const corrupted = stored.slice(0, -3) + "xyz";

    expect(() => decryptWebhookSecret(corrupted)).toThrow(
      "Webhook signing secret could not be decrypted",
    );
  });
});
