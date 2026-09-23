import { Prisma } from "@prisma/client";
import { prisma } from "@/utils/prisma";
import { AppError } from "@/utils/errors";

// Platform-wide API limits, edited by an administrator. There are no plans: every
// client gets the same limits.
export interface PlatformLimits {
  // Requests per minute for LIVE keys (per client and per key). TEST keys use TEST_RATE_LIMIT_PER_MIN.
  rateLimitPerMinute: number;
  // Active LIVE keys a client may hold.
  maxLiveKeys: number;
  // When true (the default) an administrator must enable LIVE access per client
  // before that client can create or use LIVE keys. Turn it off to open LIVE to everyone.
  requireLiveApproval: boolean;
}

export const DEFAULT_LIMITS: PlatformLimits = { rateLimitPerMinute: 300, maxLiveKeys: 20, requireLiveApproval: true };
export const MAX_TEST_KEYS = 3;

const KEY = "limits";
const TTL_MS = 15_000;
let cache: { at: number; value: PlatformLimits } | null = null;

export async function getLimits(): Promise<PlatformLimits> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const row = await prisma.platformSetting.findUnique({ where: { key: KEY } });
  const value = { ...DEFAULT_LIMITS, ...((row?.value as Partial<PlatformLimits> | undefined) ?? {}) };
  cache = { at: Date.now(), value };
  return value;
}

export async function saveLimits(limits: PlatformLimits): Promise<PlatformLimits> {
  await prisma.platformSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: limits as unknown as Prisma.InputJsonValue },
    update: { value: limits as unknown as Prisma.InputJsonValue },
  });
  cache = null;
  return limits;
}

export const isLiveAllowed = (limits: PlatformLimits, client: { liveEnabled: boolean }) =>
  !limits.requireLiveApproval || client.liveEnabled;

export function assertLiveAllowed(limits: PlatformLimits, client: { liveEnabled: boolean }): void {
  if (!isLiveAllowed(limits, client)) {
    throw new AppError("FORBIDDEN", "LIVE access has not been enabled for this account yet. Contact support to activate it.");
  }
}
