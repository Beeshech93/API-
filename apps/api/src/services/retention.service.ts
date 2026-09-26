import { prisma } from "@/utils/prisma";

// Operational records that only matter for a while are trimmed so the tables — and the queries that
// read them for the dashboards — don't grow without bound. Transactions, balances and the audit log
// are never touched.
export const RETENTION_DAYS = 90;

export async function purgeOldRecords(days = RETENTION_DAYS) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [apiLogs, providerLogs, deliveries] = await Promise.all([
    prisma.apiLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.providerLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    // Only finished deliveries: one still being retried is not old news.
    prisma.webhookDelivery.deleteMany({ where: { createdAt: { lt: cutoff }, status: { in: ["SUCCEEDED", "EXHAUSTED"] } } }),
  ]);
  return { api_logs: apiLogs.count, provider_logs: providerLogs.count, webhook_deliveries: deliveries.count };
}
