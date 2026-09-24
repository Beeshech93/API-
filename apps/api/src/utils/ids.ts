import crypto from "crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomString(length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export const newTransactionId = () => `txn_${randomString(20)}`;
export const newFundingId = () => `fnd_${randomString(20)}`;
export const newRequestId = () => `req_${randomString(16)}`;
