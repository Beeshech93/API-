import { decryptCredentialPayload, encryptCredentialPayload } from "@/utils/credentialCrypto";

describe("credentialCrypto", () => {
  it("encrypts and decrypts a provider credential payload losslessly", () => {
    const secret = { clientId: "abc123", clientSecret: "super-secret", webhookSecret: "whsec_test" };
    const encrypted = encryptCredentialPayload(secret);

    expect(encrypted.encryptedPayload).not.toContain("super-secret");

    const decrypted = decryptCredentialPayload(encrypted);
    expect(decrypted).toEqual(secret);
  });

  it("fails to decrypt if the ciphertext is tampered with", () => {
    const encrypted = encryptCredentialPayload({ clientId: "a", clientSecret: "b", webhookSecret: "c" });
    const tampered = { ...encrypted, encryptedPayload: Buffer.from("tampered").toString("base64") };
    expect(() => decryptCredentialPayload(tampered)).toThrow();
  });
});
