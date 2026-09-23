import crypto from "crypto";
import { env } from "@/config/env";
import { AppError } from "@/utils/errors";

// AES-256-GCM for secrets that must be stored (e.g. provider credentials an
// administrator enters in the panel). The key comes from the backend
// environment only; a stolen database dump is useless without it.
export interface SealedBox {
  iv: string;
  tag: string;
  data: string;
}

function key(): Buffer {
  const raw = env.secretsKey;
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new AppError("INTERNAL_ERROR", "Secret storage is not configured on this server (CREDENTIALS_ENCRYPTION_KEY).");
  }
  return buf;
}

export function seal(value: object): SealedBox {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}

export function open<T = Record<string, string>>(box: SealedBox): T {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(box.iv, "base64"));
  decipher.setAuthTag(Buffer.from(box.tag, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(box.data, "base64")), decipher.final()]);
  return JSON.parse(plain.toString("utf8")) as T;
}
