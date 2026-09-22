import crypto from "crypto";
import { env } from "@/config/env";
import { AppError } from "@/utils/errors";

const ALGORITHM = "aes-256-gcm";

function loadMasterKey(): Buffer {
  const raw = env.credentialsEncryptionKey;
  if (!raw) {
    throw AppError.badRequest(
      "CREDENTIALS_ENCRYPTION_KEY is not configured on this server. Set a 32-byte base64 or hex key before saving provider credentials.",
      "ENCRYPTION_NOT_CONFIGURED"
    );
  }
  const buf = /^[0-9a-fA-F]+$/.test(raw) && raw.length === 64 ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw AppError.badRequest(
      "CREDENTIALS_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).",
      "ENCRYPTION_NOT_CONFIGURED"
    );
  }
  return buf;
}

export interface EncryptedPayload {
  encryptedPayload: string;
  iv: string;
  authTag: string;
}

export function encryptCredentialPayload(plaintextJson: object): EncryptedPayload {
  const key = loadMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(plaintextJson), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encryptedPayload: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptCredentialPayload<T = Record<string, string>>(payload: EncryptedPayload): T {
  const key = loadMasterKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.encryptedPayload, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8")) as T;
}
