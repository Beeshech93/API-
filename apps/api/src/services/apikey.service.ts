import { KeyMode } from "@ayitipay/shared";
import { prisma } from "@/utils/prisma";
import { AppError } from "@/utils/errors";
import { extractKeyPrefix, generateApiKey, verifyApiKey } from "@/utils/apiKeyCrypto";

export async function issueApiKey(applicationId: string, mode: KeyMode, label?: string) {
  const { fullToken, keyPrefix, hashedSecret } = generateApiKey(mode);
  const apiKey = await prisma.apiKey.create({
    data: { applicationId, mode, label, keyPrefix, hashedSecret },
  });
  // The raw token is only ever returned once, at creation time, and is never
  // stored — only its prefix + hash persist.
  return { id: apiKey.id, mode: apiKey.mode, label: apiKey.label, keyPrefix, fullToken, createdAt: apiKey.createdAt };
}

export async function listApiKeys(applicationId: string) {
  return prisma.apiKey.findMany({
    where: { applicationId },
    select: { id: true, mode: true, label: true, keyPrefix: true, lastUsedAt: true, revokedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeApiKey(applicationId: string, apiKeyId: string) {
  const key = await prisma.apiKey.findFirst({ where: { id: apiKeyId, applicationId } });
  if (!key) throw AppError.notFound("API key not found.", "API_KEY_NOT_FOUND");
  await prisma.apiKey.update({ where: { id: apiKeyId }, data: { revokedAt: new Date() } });
}

export interface ResolvedApiKey {
  id: string;
  applicationId: string;
  mode: KeyMode;
  developerId: string;
}

export async function resolveApiKey(fullToken: string): Promise<ResolvedApiKey> {
  let prefix: string;
  try {
    prefix = extractKeyPrefix(fullToken);
  } catch {
    throw AppError.unauthorized("Malformed API key.", "INVALID_API_KEY");
  }

  const record = await prisma.apiKey.findUnique({
    where: { keyPrefix: prefix },
    include: { application: { select: { developerId: true } } },
  });

  if (!record || record.revokedAt) throw AppError.unauthorized("Invalid API key.", "INVALID_API_KEY");
  if (!verifyApiKey(fullToken, record.hashedSecret)) {
    throw AppError.unauthorized("Invalid API key.", "INVALID_API_KEY");
  }

  prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {
    // best-effort — never block the request on this bookkeeping write
  });

  return {
    id: record.id,
    applicationId: record.applicationId,
    mode: record.mode,
    developerId: record.application.developerId,
  };
}
