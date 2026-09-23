import { prisma } from "@/utils/prisma";
import { getLiveProvider } from "@/providers/provider.factory";
import { isBazikConfigured } from "@/config/env";

export const PROVIDER_CODES = [
  { code: "bazik", name: "Bazik" },
  { code: "moncash", name: "MonCash" },
  { code: "natcash", name: "NatCash" },
] as const;

export async function logProviderCall(entry: {
  providerCode: string; operation: string; requestId?: string; success: boolean; responseMs: number; errorCode?: string; errorMessage?: string;
}) {
  try {
    await prisma.providerLog.create({ data: entry });
  } catch {
    // never fail a payment because of a monitoring write
  }
}

// Probes Bazik, then derives MonCash/NatCash health from the error rate of the
// real (LIVE) calls seen in the last 15 minutes.
export async function checkProviders() {
  const health = await getLiveProvider().healthCheck();
  const now = new Date();
  const since = new Date(now.getTime() - 15 * 60_000);

  await prisma.provider.upsert({
    where: { code: "bazik" },
    create: { code: "bazik", name: "Bazik", status: health.ok ? "OPERATIONAL" : "DOWN", lastCheckedAt: now, lastSuccessAt: health.ok ? now : null, lastResponseMs: health.responseMs, message: health.message },
    update: { status: health.ok ? "OPERATIONAL" : "DOWN", lastCheckedAt: now, ...(health.ok ? { lastSuccessAt: now } : {}), lastResponseMs: health.responseMs, message: health.message },
  });

  for (const code of ["moncash", "natcash"] as const) {
    const logs = await prisma.providerLog.findMany({ where: { providerCode: code, createdAt: { gte: since } } });
    const errors = logs.filter((l) => !l.success).length;
    const errorRate = logs.length ? errors / logs.length : 0;
    const avg = logs.length ? Math.round(logs.reduce((s, l) => s + l.responseMs, 0) / logs.length) : null;
    const status = !isBazikConfigured() ? "UNKNOWN" : logs.length === 0 ? "UNKNOWN" : errorRate > 0.5 ? "DOWN" : errorRate > 0.1 ? "DEGRADED" : "OPERATIONAL";
    const lastOk = logs.filter((l) => l.success).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    await prisma.provider.upsert({
      where: { code },
      create: { code, name: code === "moncash" ? "MonCash" : "NatCash", status, lastCheckedAt: now, lastSuccessAt: lastOk?.createdAt ?? null, lastResponseMs: avg, errorRate },
      update: { status, lastCheckedAt: now, ...(lastOk ? { lastSuccessAt: lastOk.createdAt } : {}), lastResponseMs: avg, errorRate },
    });
  }
  return listProviders();
}

export async function listProviders() {
  const rows = await prisma.provider.findMany({ orderBy: { code: "asc" } });
  return rows.map((p) => ({
    code: p.code, name: p.name, status: p.status.toLowerCase(), last_checked_at: p.lastCheckedAt,
    last_success_at: p.lastSuccessAt, response_time_ms: p.lastResponseMs, error_rate: p.errorRate, message: p.message,
    // Credentials are never exposed; only whether they are configured.
    credentials: p.code === "bazik" ? (isBazikConfigured() ? "configured" : "missing") : undefined,
  }));
}
