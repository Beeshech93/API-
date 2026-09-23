import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/errors";
import { clientIp } from "@/utils/ip";
import { prisma } from "@/utils/prisma";
import { tbl } from "@/utils/sql";
import { requireUser } from "@/middleware/auth.jwt";
import { createKeySchema, createWebhookSchema, listQuerySchema } from "@/validators/schemas";
import * as keys from "@/services/apikey.service";
import * as webhooks from "@/services/webhook.service";
import * as billing from "@/services/billing.service";
import * as payments from "@/services/payment.service";
import { getEntitlements } from "@/services/entitlements.service";
import { getUsage } from "@/services/usage.service";

export const portalRouter = Router();
portalRouter.use(requireUser);

const actor = (req: import("express").Request) => ({ userId: req.user!.id, ip: clientIp(req) });

// ---- Overview ----------------------------------------------------------

portalRouter.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const clientId = req.user!.clientId;
    const [entitlements, usage, activeKeys, statusGroups] = await Promise.all([
      getEntitlements(clientId),
      getUsage(clientId),
      prisma.apiKey.count({ where: { clientId, revokedAt: null } }),
      prisma.transaction.groupBy({ by: ["status"], where: { clientId }, _count: true }),
    ]);
    const count = (s: string) => statusGroups.find((g) => g.status === s)?._count ?? 0;
    const completed = count("COMPLETED");
    const failed = count("FAILED");
    const total = statusGroups.reduce((sum, g) => sum + g._count, 0);
    const finished = completed + failed;

    const [requestsPerDay, transactionsPerDay, uptime] = await Promise.all([
      prisma.$queryRaw<{ day: Date; requests: number; failed: number }[]>`
        SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS requests,
               COUNT(*) FILTER (WHERE status_code >= 400)::int AS failed
        FROM ${tbl("api_logs")} WHERE client_id = ${clientId} AND created_at > NOW() - INTERVAL '14 days'
        GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<{ day: Date; transactions: number; completed: number; failed: number }[]>`
        SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS transactions,
               COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
               COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed
        FROM ${tbl("transactions")} WHERE client_id = ${clientId} AND created_at > NOW() - INTERVAL '14 days'
        GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<{ total: number; errors: number }[]>`
        SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status_code >= 500)::int AS errors
        FROM ${tbl("api_logs")} WHERE created_at > NOW() - INTERVAL '30 days'`,
    ]);

    res.json({
      success: true,
      plan: entitlements.subscription ? billing.serializePlan(entitlements.subscription.plan) : null,
      subscription_status: entitlements.subscription?.status.toLowerCase() ?? "none",
      live_access: entitlements.active,
      requests: {
        used: usage.requests,
        limit: entitlements.monthlyRequestLimit,
        remaining: entitlements.monthlyRequestLimit === null ? null : Math.max(0, entitlements.monthlyRequestLimit - usage.requests),
        period: usage.period,
      },
      transactions: { total, completed, failed },
      success_rate: finished ? Math.round((completed / finished) * 1000) / 10 : null,
      api_uptime: uptime[0]?.total ? Math.round((1 - uptime[0].errors / uptime[0].total) * 10000) / 100 : null,
      active_api_keys: activeKeys,
      charts: { requests_per_day: requestsPerDay, transactions_per_day: transactionsPerDay },
    });
  })
);

portalRouter.get("/usage", asyncHandler(async (req, res) => {
  const clientId = req.user!.clientId;
  const entitlements = await getEntitlements(clientId);
  const history = await prisma.usageRecord.findMany({ where: { clientId }, orderBy: { period: "desc" }, take: 12 });
  res.json({
    success: true,
    limit: entitlements.monthlyRequestLimit,
    history: history.map((h) => ({ period: h.period, requests: h.requests, transactions: h.transactions })),
  });
}));

// ---- API keys ----------------------------------------------------------

portalRouter.get("/api-keys", asyncHandler(async (req, res) => {
  res.json({ success: true, api_keys: await keys.listKeys(req.user!.clientId) });
}));

portalRouter.post("/api-keys", asyncHandler(async (req, res) => {
  const body = createKeySchema.parse(req.body);
  res.status(201).json({ success: true, ...(await keys.createKey(req.user!.clientId, actor(req), body)) });
}));

portalRouter.post("/api-keys/:id/rotate", asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await keys.rotateKey(req.user!.clientId, req.params.id, actor(req))) });
}));

portalRouter.delete("/api-keys/:id", asyncHandler(async (req, res) => {
  await keys.revokeKey(req.user!.clientId, req.params.id, actor(req));
  res.json({ success: true });
}));

// ---- Transactions (read-only: states change only from the backend) -------

portalRouter.get("/transactions", asyncHandler(async (req, res) => {
  const q = listQuerySchema.parse(req.query);
  const rows = await payments.listTransactions(
    req.user!.clientId,
    q.environment ? (q.environment.toUpperCase() as "TEST" | "LIVE") : undefined,
    { status: q.status?.toUpperCase() as never, limit: q.limit, before: q.before ? new Date(q.before) : undefined }
  );
  res.json({ success: true, transactions: rows.map(payments.serializeTransaction) });
}));

portalRouter.get("/transactions/:id", asyncHandler(async (req, res) => {
  const t = await prisma.transaction.findFirst({
    where: { id: req.params.id, clientId: req.user!.clientId },
    include: { events: { orderBy: { createdAt: "desc" } } },
  });
  if (!t) throw new AppError("TRANSACTION_NOT_FOUND", "Transaction not found.");
  res.json({ ...payments.serializeTransaction(t), events: t.events.map((e) => ({ status: e.status.toLowerCase(), source: e.source, created_at: e.createdAt })) });
}));

// ---- Webhooks ----------------------------------------------------------

portalRouter.get("/webhooks", asyncHandler(async (req, res) => {
  res.json({ success: true, webhooks: await webhooks.listWebhooks(req.user!.clientId), events: webhooks.WEBHOOK_EVENTS });
}));
portalRouter.post("/webhooks", asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, ...(await webhooks.createWebhook(req.user!.clientId, actor(req), createWebhookSchema.parse(req.body))) });
}));
portalRouter.post("/webhooks/:id/rotate-secret", asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await webhooks.rotateWebhookSecret(req.user!.clientId, req.params.id)) });
}));
portalRouter.delete("/webhooks/:id", asyncHandler(async (req, res) => {
  await webhooks.deleteWebhook(req.user!.clientId, req.params.id);
  res.json({ success: true });
}));
portalRouter.get("/webhook-deliveries", asyncHandler(async (req, res) => {
  res.json({ success: true, deliveries: await webhooks.listDeliveries(req.user!.clientId) });
}));
portalRouter.post("/webhook-deliveries/:id/redeliver", asyncHandler(async (req, res) => {
  await webhooks.redeliver(req.user!.clientId, req.params.id);
  res.json({ success: true });
}));

// ---- API logs (searchable) -----------------------------------------------

const logQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  method: z.string().max(10).optional(),
  status: z.coerce.number().int().min(100).max(599).optional(),
  endpoint: z.string().max(100).optional(),
  request_id: z.string().max(40).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  before: z.string().datetime().optional(),
});

portalRouter.get("/api-logs", asyncHandler(async (req, res) => {
  const q = logQuery.parse(req.query);
  const rows = await prisma.apiLog.findMany({
    where: {
      clientId: req.user!.clientId,
      ...(q.method ? { method: q.method.toUpperCase() } : {}),
      ...(q.status ? { statusCode: q.status } : {}),
      ...(q.endpoint ? { endpoint: { contains: q.endpoint } } : {}),
      ...(q.request_id ? { requestId: q.request_id } : {}),
      createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}), ...(q.before ? { lt: new Date(q.before) } : {}) },
    },
    orderBy: { createdAt: "desc" },
    take: q.limit,
  });
  res.json({
    success: true,
    logs: rows.map((l) => ({
      request_id: l.requestId, endpoint: l.endpoint, method: l.method, status_code: l.statusCode,
      response_time_ms: l.responseMs, ip: l.ip, provider: l.provider, environment: l.environment?.toLowerCase(), created_at: l.createdAt,
    })),
  });
}));

// ---- Billing -----------------------------------------------------------

portalRouter.get("/billing", asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await billing.getBillingOverview(req.user!.clientId)), plans: await billing.listPublicPlans() });
}));
portalRouter.post("/billing/plan", asyncHandler(async (req, res) => {
  const { plan_code } = z.object({ plan_code: z.string().min(1).max(30) }).parse(req.body);
  await billing.selectPlan(req.user!.clientId, plan_code, actor(req));
  res.json({ success: true, ...(await billing.getBillingOverview(req.user!.clientId)) });
}));
portalRouter.post("/billing/cancel", asyncHandler(async (req, res) => {
  await billing.cancelSubscription(req.user!.clientId, actor(req));
  res.json({ success: true, ...(await billing.getBillingOverview(req.user!.clientId)) });
}));
