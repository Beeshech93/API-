import { ApiEnvironment } from "@prisma/client";
import { prisma } from "@/utils/prisma";
import { AppError } from "@/utils/errors";
import { extractKeyPrefix, generateApiKey, maskApiKey, verifyApiKey } from "@/utils/apiKeyCrypto";
import { getEntitlements, MAX_TEST_KEYS } from "@/services/entitlements.service";
import { audit } from "@/services/audit.service";

export const PERMISSIONS = [
  "payments:read",
  "payments:create",
  "transfers:read",
  "transfers:create",
  "balance:read",
  "transactions:read",
  "webhooks:manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export interface AuthenticatedKey {
  apiKeyId: string;
  clientId: string;
  environment: ApiEnvironment;
  permissions: string[];
}

function serialize(key: {
  id: string; name: string; environment: ApiEnvironment; keyPrefix: string; last4: string;
  permissions: string[]; lastUsedAt: Date | null; revokedAt: Date | null; createdAt: Date;
}) {
  return {
    id: key.id,
    name: key.name,
    environment: key.environment,
    masked_key: maskApiKey(key.keyPrefix, key.last4),
    permissions: key.permissions,
    last_used_at: key.lastUsedAt,
    status: key.revokedAt ? "revoked" : "active",
    created_at: key.createdAt,
  };
}

export async function listKeys(clientId: string) {
  const keys = await prisma.apiKey.findMany({ where: { clientId }, orderBy: { createdAt: "desc" } });
  return keys.map(serialize);
}

export async function createKey(
  clientId: string,
  actor: { userId: string; ip?: string },
  input: { name: string; environment: ApiEnvironment; permissions: Permission[] }
) {
  const activeOfEnvironment = await prisma.apiKey.count({
    where: { clientId, environment: input.environment, revokedAt: null },
  });

  if (input.environment === "LIVE") {
    const entitlements = await getEntitlements(clientId);
    if (!entitlements.active) {
      throw new AppError("SUBSCRIPTION_REQUIRED", "An active subscription is required to create LIVE API keys.");
    }
    if (entitlements.maxLiveKeys !== null && activeOfEnvironment >= entitlements.maxLiveKeys) {
      throw new AppError("FORBIDDEN", `Your plan allows ${entitlements.maxLiveKeys} active LIVE API key(s).`);
    }
  } else if (activeOfEnvironment >= MAX_TEST_KEYS) {
    throw new AppError("FORBIDDEN", `You can have at most ${MAX_TEST_KEYS} active TEST API keys.`);
  }

  const generated = generateApiKey(input.environment);
  const record = await prisma.apiKey.create({
    data: {
      clientId,
      name: input.name,
      environment: input.environment,
      keyPrefix: generated.keyPrefix,
      last4: generated.last4,
      hashedSecret: generated.hashedSecret,
      permissions: input.permissions,
      createdByUserId: actor.userId,
    },
  });
  await audit({ action: "api_key.created", actorUserId: actor.userId, clientId, targetType: "api_key", targetId: record.id, ip: actor.ip, metadata: { environment: input.environment } });
  // The only time the full key exists outside the client's hands.
  return { ...serialize(record), api_key: generated.fullToken };
}

export async function revokeKey(clientId: string, keyId: string, actor: { userId: string; ip?: string }) {
  const key = await prisma.apiKey.findFirst({ where: { id: keyId, clientId } });
  if (!key) throw new AppError("NOT_FOUND", "API key not found.");
  if (!key.revokedAt) {
    await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
    await audit({ action: "api_key.revoked", actorUserId: actor.userId, clientId, targetType: "api_key", targetId: key.id, ip: actor.ip });
  }
}

export async function rotateKey(clientId: string, keyId: string, actor: { userId: string; ip?: string }) {
  const key = await prisma.apiKey.findFirst({ where: { id: keyId, clientId, revokedAt: null } });
  if (!key) throw new AppError("NOT_FOUND", "Active API key not found.");
  const generated = generateApiKey(key.environment);
  const [, created] = await prisma.$transaction([
    prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } }),
    prisma.apiKey.create({
      data: {
        clientId,
        name: key.name,
        environment: key.environment,
        keyPrefix: generated.keyPrefix,
        last4: generated.last4,
        hashedSecret: generated.hashedSecret,
        permissions: key.permissions,
        createdByUserId: actor.userId,
      },
    }),
  ]);
  await audit({ action: "api_key.rotated", actorUserId: actor.userId, clientId, targetType: "api_key", targetId: created.id, ip: actor.ip, metadata: { replaced: key.id } });
  return { ...serialize(created), api_key: generated.fullToken };
}

export async function authenticate(fullToken: string): Promise<AuthenticatedKey> {
  const prefix = extractKeyPrefix(fullToken);
  if (!prefix) throw new AppError("INVALID_API_KEY", "Invalid API key.");

  const key = await prisma.apiKey.findUnique({ where: { keyPrefix: prefix } });
  if (!key || key.revokedAt || !verifyApiKey(fullToken, key.hashedSecret)) {
    throw new AppError("INVALID_API_KEY", "Invalid API key.");
  }
  prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  return { apiKeyId: key.id, clientId: key.clientId, environment: key.environment, permissions: key.permissions };
}
