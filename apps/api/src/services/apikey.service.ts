import { ApiEnvironment, ApiKeyCategory } from "@prisma/client";
import { prisma } from "@/utils/prisma";
import { AppError } from "@/utils/errors";
import { extractKeyPrefix, generateApiKey, maskApiKey, verifyApiKey } from "@/utils/apiKeyCrypto";
import { assertLiveAllowed, getLimits, MAX_TEST_KEYS } from "@/services/limits.service";
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
  category: ApiKeyCategory;
}

// A key belongs to one API: receiving payments or sending money. What each may hold:
export type NewKeyCategory = "RECEIVE" | "SEND";
export const CATEGORY_PERMISSIONS: Record<NewKeyCategory, Permission[]> = {
  RECEIVE: ["payments:read", "payments:create", "transactions:read", "balance:read", "webhooks:manage"],
  SEND: ["transfers:read", "transfers:create", "transactions:read", "balance:read", "webhooks:manage"],
};
export const DEFAULT_CATEGORY_PERMISSIONS: Record<NewKeyCategory, Permission[]> = {
  RECEIVE: ["payments:read", "payments:create", "transactions:read", "balance:read"],
  SEND: ["transfers:read", "transfers:create", "transactions:read", "balance:read"],
};

function serialize(key: {
  id: string; name: string; environment: ApiEnvironment; keyPrefix: string; last4: string;
  permissions: string[]; category: ApiKeyCategory; lastUsedAt: Date | null; revokedAt: Date | null; createdAt: Date;
}) {
  return {
    id: key.id,
    name: key.name,
    environment: key.environment,
    masked_key: maskApiKey(key.keyPrefix, key.last4),
    permissions: key.permissions,
    category: key.category.toLowerCase(),
    last_used_at: key.lastUsedAt,
    status: key.revokedAt ? "revoked" : "active",
    created_at: key.createdAt,
  };
}

export async function listKeys(clientId: string) {
  const keys = await prisma.apiKey.findMany({ where: { clientId }, orderBy: { createdAt: "desc" } });
  return keys.map(serialize);
}

// Permissions that only make sense for one of the two jobs an account can have.
const RECEIVE_PERMISSIONS: Permission[] = ["payments:read", "payments:create"];
const SEND_PERMISSIONS: Permission[] = ["transfers:read", "transfers:create"];

export function assertPermissionsFit(services: { canReceive: boolean; canSend: boolean }, permissions: readonly string[]) {
  // Receiving and sending are separate APIs with separate keys: a leaked key that can
  // collect payments must not be able to send money out (and vice versa).
  const receives = permissions.some((p) => (RECEIVE_PERMISSIONS as string[]).includes(p));
  const sends = permissions.some((p) => (SEND_PERMISSIONS as string[]).includes(p));
  if (receives && sends) {
    throw new AppError("INVALID_REQUEST", "A key is either for the receive-payments API or for the send-money API, not both. Create one key for each.");
  }
  if (!services.canReceive && permissions.some((p) => (RECEIVE_PERMISSIONS as string[]).includes(p))) {
    throw new AppError("FORBIDDEN", "This account is not set up to receive payments, so it can't use payments permissions.");
  }
  if (!services.canSend && permissions.some((p) => (SEND_PERMISSIONS as string[]).includes(p))) {
    throw new AppError("FORBIDDEN", "This account is not set up to send money, so it can't use transfers permissions.");
  }
}

export async function createKey(
  clientId: string,
  actor: { userId: string; ip?: string },
  input: { name: string; environment: ApiEnvironment; category?: NewKeyCategory; permissions?: Permission[] }
) {
  const account = (await prisma.client.findUnique({ where: { id: clientId }, select: { canReceive: true, canSend: true } })) ?? { canReceive: false, canSend: false };

  // Which API is this key for? Explicit, or worked out from what it may do.
  const hasPayments = input.permissions?.some((p) => p.startsWith("payments:")) ?? false;
  const hasTransfers = input.permissions?.some((p) => p.startsWith("transfers:")) ?? false;
  if (hasPayments && hasTransfers) {
    throw new AppError("INVALID_REQUEST", "A key is either for the receive-payments API or for the send-money API, not both. Create one key for each.");
  }
  const category: NewKeyCategory = input.category ?? (hasTransfers ? "SEND" : hasPayments ? "RECEIVE" : account.canReceive ? "RECEIVE" : "SEND");
  if ((category === "RECEIVE" && hasTransfers) || (category === "SEND" && hasPayments)) {
    throw new AppError("INVALID_REQUEST", `A ${category === "RECEIVE" ? "receive-payments" : "send-money"} key can't have ${category === "RECEIVE" ? "transfers" : "payments"} permissions.`);
  }
  const permissions = input.permissions ?? DEFAULT_CATEGORY_PERMISSIONS[category];
  if (!account.canReceive && category === "RECEIVE") throw new AppError("FORBIDDEN", "This account is not set up to receive payments, so it can't have receive-payments keys.");
  if (!account.canSend && category === "SEND") throw new AppError("FORBIDDEN", "This account is not set up to send money, so it can't have send-money keys.");
  assertPermissionsFit(account, permissions);

  // Limits are per category: an account can hold receive keys and send keys side by side.
  const activeOfEnvironment = await prisma.apiKey.count({
    where: { clientId, environment: input.environment, category, revokedAt: null },
  });

  if (input.environment === "LIVE") {
    const [limits, client] = await Promise.all([getLimits(), prisma.client.findUnique({ where: { id: clientId }, select: { liveEnabled: true } })]);
    assertLiveAllowed(limits, { liveEnabled: client?.liveEnabled ?? false });
    if (activeOfEnvironment >= limits.maxLiveKeys) {
      throw new AppError("FORBIDDEN", `You can have at most ${limits.maxLiveKeys} active LIVE API keys.`);
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
      permissions,
      category,
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
        category: key.category,
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
  return { apiKeyId: key.id, clientId: key.clientId, environment: key.environment, permissions: key.permissions, category: key.category };
}
