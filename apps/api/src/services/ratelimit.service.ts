import { prisma } from "@/utils/prisma";
import { tbl } from "@/utils/sql";

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfter: number;
}

// Fixed-window counter shared through Postgres, so limits hold across every
// serverless instance (an in-memory limiter would reset per instance).
// Upgrade path for very high volume: move these counters to Redis.
export async function hit(key: string, limit: number, windowSeconds = 60): Promise<RateLimitResult> {
  const nowMs = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(nowMs / windowMs) * windowMs);

  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO ${tbl("rate_limit_counters")} ("key", window_start, "count")
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key", window_start) DO UPDATE SET "count" = rate_limit_counters."count" + 1
    RETURNING "count"`;

  const count = Number(rows[0]?.count ?? 1);
  const retryAfter = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - nowMs) / 1000));
  return { allowed: count <= limit, count, limit, retryAfter };
}

export async function purgeOldCounters(olderThanMinutes = 10): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const result = await prisma.rateLimitCounter.deleteMany({ where: { windowStart: { lt: cutoff } } });
  return result.count;
}
