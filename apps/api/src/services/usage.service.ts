import { prisma } from "@/utils/prisma";
import { tbl } from "@/utils/sql";

export function currentPeriod(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Atomically counts one request against the client's monthly quota. The
// conditional upsert only increments while under the limit, so concurrent
// requests can never overshoot it. Returns null when the quota is exhausted.
export async function consumeRequest(clientId: string, monthlyLimit: number | null): Promise<number | null> {
  const period = currentPeriod();
  const limit = monthlyLimit ?? 2_000_000_000;
  const rows = await prisma.$queryRaw<{ requests: number }[]>`
    INSERT INTO ${tbl("usage_records")} (id, client_id, period, requests, transactions, updated_at)
    VALUES (gen_random_uuid(), ${clientId}, ${period}, 1, 0, NOW())
    ON CONFLICT (client_id, period) DO UPDATE
      SET requests = usage_records.requests + 1, updated_at = NOW()
      WHERE usage_records.requests < ${limit}
    RETURNING requests`;
  return rows.length ? Number(rows[0].requests) : null;
}

export async function recordTransaction(clientId: string): Promise<void> {
  const period = currentPeriod();
  await prisma.$executeRaw`
    INSERT INTO ${tbl("usage_records")} (id, client_id, period, requests, transactions, updated_at)
    VALUES (gen_random_uuid(), ${clientId}, ${period}, 0, 1, NOW())
    ON CONFLICT (client_id, period) DO UPDATE
      SET transactions = usage_records.transactions + 1, updated_at = NOW()`;
}

export async function getUsage(clientId: string, period = currentPeriod()) {
  const record = await prisma.usageRecord.findUnique({ where: { clientId_period: { clientId, period } } });
  return { period, requests: record?.requests ?? 0, transactions: record?.transactions ?? 0 };
}
