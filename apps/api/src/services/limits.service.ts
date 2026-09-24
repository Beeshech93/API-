import { KycStatus, Prisma } from "@prisma/client";
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

export interface LiveSubject {
  liveEnabled: boolean;
  kycStatus: KycStatus;
}

// Real money needs, in this order: an approved identity verification (KYC — always), and
// unless the administrator switched it off, LIVE access enabled for the client.
export function liveBlockReason(limits: PlatformLimits, client: LiveSubject): string | null {
  if (client.kycStatus === "PENDING") return "Your identity verification (KYC) is under review. LIVE access opens once it is approved.";
  if (client.kycStatus === "REJECTED") return "Your identity verification (KYC) was not approved. Review the notes in your dashboard and submit it again.";
  if (client.kycStatus !== "APPROVED") return "Identity verification (KYC) is required before using LIVE. Complete it in your dashboard under Verification.";
  if (limits.requireLiveApproval && !client.liveEnabled) return "LIVE access has not been enabled for this account yet. Contact support to activate it.";
  return null;
}

export const isLiveAllowed = (limits: PlatformLimits, client: LiveSubject) => liveBlockReason(limits, client) === null;

export function assertLiveAllowed(limits: PlatformLimits, client: LiveSubject): void {
  const reason = liveBlockReason(limits, client);
  if (reason) throw new AppError("FORBIDDEN", reason);
}
