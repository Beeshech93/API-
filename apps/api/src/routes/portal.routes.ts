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
import * as payments from "@/services/payment.service";
import { getLimits, isLiveAllowed } from "@/services/limits.service";
import * as funding from "@/services/funding.service";
import { ipRateLimit } from "@/middleware/rateLimit";
import { getUsage } from "@/services/usage.service";

export const portalRouter = Router();
portalRouter.use(requireUser);

const actor = (req: import("express").Request) => ({ userId: req.user!.id, ip: clientIp(req) });

// ---- Overview ----------------------------------------------------------

// What the account is set up for; the dashboard adapts to it.
portalRouter.get("/account", asyncHandler(async (req, res) => {
  const [client, limits] = await Promise.all([prisma.client.findUnique({ where: { id: req.user!.clientId } }), getLimits()]);
  if (!client) throw new AppError("NOT_FOUND", "Client not found.");
  res.json({ success: true, name: client.name, services: { receive: client.canReceive, send: client.canSend }, live_access: isLiveAllowed(limits, client) });
}));

portalRouter.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const clientId = req.user!.clientId;
    const [limits, client, usage, activeKeys, statusGroups] = await Promise.all([
      getLimits(),
      prisma.client.findUnique({ where: { id: clientId }, select: { liveEnabled: true, canReceive: true, canSend: true } }),
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
      live_access: isLiveAllowed(limits, { liveEnabled: client?.liveEnabled ?? false }),
      services: { receive: client?.canReceive ?? false, send: client?.canSend ?? false },
      requests: { used: usage.requests, period: usage.period },
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
  const history = await prisma.usageRecord.findMany({ where: { clientId }, orderBy: { period: "desc" }, take: 12 });
  res.json({
    success: true,
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

// ---- Funding (recharge the balance) ----------------------------------------

const fundingSchema = z.object({
  method: z.enum(["moncash", "natcash", "zelle", "bank_deposit", "bank_transfer", "crypto_usdt"]).transform((m) => m.toUpperCase() as import("@prisma/client").FundingMethod),
  amount: z.number({ invalid_type_error: "Amount must be a number." }).positive(),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(300).optional(),
});

portalRouter.get("/funding", asyncHandler(async (req, res) => {
  const clientId = req.user!.clientId;
  // In this order on purpose: listing re-checks pending fundings with the provider,
  // and the balance must be read after that so it includes what was just settled.
  const methods = await funding.listMethods();
  const fundings = await funding.listClientFundings(clientId);
  const balances = await payments.getCollectedBalance(clientId, "LIVE");
  const htg = balances.find((b) => b.currency === "HTG");
  res.json({
    success: true,
    methods,
    balance: { currency: "HTG", available: htg?.available ?? 0, funded: htg?.funded ?? 0, collected: htg?.collected ?? 0 },
    fundings: fundings.map(funding.serializeFunding),
  });
}));

portalRouter.post("/funding", ipRateLimit(20, "funding"), asyncHandler(async (req, res) => {
  const body = fundingSchema.parse(req.body);
  const client = await prisma.client.findUnique({ where: { id: req.user!.clientId }, select: { id: true, liveEnabled: true, canSend: true } });
  if (!client) throw new AppError("NOT_FOUND", "Client not found.");
  const created = await funding.createFunding(client, body, req.ctx.requestId);
  res.status(201).json({ success: true, funding: funding.serializeFunding(created) });
}));
