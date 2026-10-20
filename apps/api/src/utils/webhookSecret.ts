import { open, seal } from "@/utils/secretBox";

const PREFIX = "enc:v1:";

/** Encrypt webhook signing secrets at rest. Legacy plaintext values remain readable
 * during migration and are upgraded lazily when a delivery worker encounters them. */
export function encryptWebhookSecret(secret: string): string {
  return PREFIX + Buffer.from(JSON.stringify(seal({ secret })), "utf8").toString("base64");
}

export function decryptWebhookSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored; // backwards compatibility for existing rows
  try {
    const encoded = stored.slice(PREFIX.length);
    const box = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    const result = open<{ secret: string }>(box);
    if (typeof result.secret !== "string" || !result.secret) throw new Error("Invalid webhook secret");
    return result.secret;
  } catch {
    // Do not silently treat corrupted ciphertext as plaintext.
    throw new Error("Webhook signing secret could not be decrypted; verify CREDENTIALS_ENCRYPTION_KEY.");
  }
}

export function isEncryptedWebhookSecret(stored: string): boolean {
  return stored.startsWith(PREFIX);
}
