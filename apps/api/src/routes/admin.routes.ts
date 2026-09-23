import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/errors";
import { clientIp } from "@/utils/ip";
import { prisma } from "@/utils/prisma";
import { tbl } from "@/utils/sql";
import { requireAdmin, requireUser } from "@/middleware/auth.jwt";
import { ipRateLimit } from "@/middleware/rateLimit";
import { audit } from "@/services/audit.service";
import * as billing from "@/services/billing.service";
import { getFeeConfig, saveFeeConfig } from "@/services/fee.service";
import { checkProviders, listProviders } from "@/services/provider.service";
import { clearConfig, getConfigSummary, saveConfig } from "@/services/providerConfig.service";
import { getUsage } from "@/services/usage.service";
import * as paymentService from "@/services/payment.service";
import { signupSchema } from "@/validators/schemas";

export const adminRouter = Router();
adminRouter.use(requireUser, requireAdmin);

const actor = (req: import("express").Request) => ({ userId: req.user!.id, ip: clientIp(req) });

adminRouter.get("/overview", asyncHandler(async (_req, res) => {
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [clients, active, revenue, requests, tx, failed, volume, providers] = await Promise.all([
    prisma.client.count(),
    prisma.subscription.count({ where: { status: { in: ["ACTIVE", "TRIAL"] } } }),
    prisma.invoice.aggregate({ where: { status: "PAID", paidAt: { gte: monthStart } }, _sum: { amountCents: true } }),
    prisma.usageRecord.aggregate({ where: { period: `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, "0")}` }, _sum: { requests: true } }),
    prisma.transaction.count({ where: { environment: "LIVE" } }),
    prisma.transaction.count({ where: { environment: "LIVE", status: "FAILED" } }),
    prisma.transaction.groupBy({ by: ["provider", "currency"], where: { environment: "LIVE", status: "COMPLETED" }, _sum: { amount: true } }),
    listProviders(),
  ]);
  res.json({
    success: true,
    total_clients: clients,
    active_subscriptions: active,
    monthly_revenue: (revenue._sum.amountCents ?? 0) / 100,
    api_requests: requests._sum.requests ?? 0,
    transactions: tx,
    failed_transactions: failed,
    volume: volume.map((v) => ({ provider: v.provider.toLowerCase(), currency: v.currency, amount: Number(v._sum.amount ?? 0) })),
    system_status: providers,
  });
}));

// ---- Clients ----------------------------------------------------------

adminRouter.get("/clients", asyncHandler(async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const clients = await prisma.client.findMany({
    where: search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { users: { some: { email: { contains: search, mode: "insensitive" } } } }] } : {},
    include: { users: { select: { email: true, role: true } }, subscription: { include: { plan: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({
    success: true,
    clients: clients.map((c) => ({
      id: c.id, name: c.name, status: c.status.toLowerCase(), created_at: c.createdAt,
      users: c.users, plan: c.subscription?.plan.code ?? null, subscription_status: c.subscription?.status.toLowerCase() ?? "none",
      subscription_end: c.subscription?.currentPeriodEnd ?? null,
    })),
  });
}));

adminRouter.get("/clients/:id", asyncHandler(async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: { users: { select: { id: true, email: true, name: true, role: true, createdAt: true } }, subscription: { include: { plan: true } }, apiKeys: true },
  });
  if (!client) throw new AppError("NOT_FOUND", "Client not found.");
  const [usage, transactions, logs] = await Promise.all([
    getUsage(client.id),
    prisma.transaction.findMany({ where: { clientId: client.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.apiLog.findMany({ where: { clientId: client.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  res.json({
    success: true,
    client: { id: client.id, name: client.name, status: client.status.toLowerCase(), created_at: client.createdAt },
    users: client.users,
    subscription: client.subscription && { plan: billing.serializePlan(client.subscription.plan), status: client.subscription.status.toLowerCase(), end: client.subscription.currentPeriodEnd },
    api_keys: client.apiKeys.map((k) => ({ id: k.id, name: k.name, environment: k.environment.toLowerCase(), last4: k.last4, status: k.revokedAt ? "revoked" : "active", last_used_at: k.lastUsedAt })),
    usage,
    transactions: transactions.map((t) => ({ id: t.id, provider: t.provider.toLowerCase(), status: t.status.toLowerCase(), amount: Number(t.amount), currency: t.currency, created_at: t.createdAt })),
    logs: logs.map((l) => ({ request_id: l.requestId, endpoint: l.endpoint, method: l.method, status_code: l.statusCode, created_at: l.createdAt })),
  });
}));

adminRouter.post("/clients", asyncHandler(async (req, res) => {
  const body = signupSchema.extend({ plan_code: z.string().optional() }).parse(req.body);
  if (await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } })) throw new AppError("CONFLICT", "Email already registered.");
  const passwordHash = await bcrypt.hash(body.password, 12);
  const created = await prisma.$transaction(async (tx) => {
    const client = await tx.client.create({ data: { name: body.name } });
    await tx.user.create({ data: { clientId: client.id, email: body.email.toLowerCase(), passwordHash, name: body.name } });
    return client;
  });
  if (body.plan_code) await billing.selectPlan(created.id, body.plan_code, actor(req));
  await audit({ action: "admin.client_created", actorUserId: req.user!.id, clientId: created.id, ip: clientIp(req) });
  res.status(201).json({ success: true, client_id: created.id });
}));

const setStatus = (status: "ACTIVE" | "SUSPENDED") =>
  asyncHandler(async (req, res) => {
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) throw new AppError("NOT_FOUND", "Client not found.");
    await prisma.client.update({ where: { id: client.id }, data: { status } });
    if (status === "SUSPENDED") {
      await prisma.refreshToken.updateMany({ where: { user: { clientId: client.id }, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await audit({ action: status === "SUSPENDED" ? "admin.client_suspended" : "admin.client_reactivated", actorUserId: req.user!.id, clientId: client.id, ip: clientIp(req) });
    res.json({ success: true });
  });
adminRouter.post("/clients/:id/suspend", setStatus("SUSPENDED"));
adminRouter.post("/clients/:id/reactivate", setStatus("ACTIVE"));

adminRouter.post("/clients/:id/plan", asyncHandler(async (req, res) => {
  const body = z.object({
    plan_code: z.string(),
    custom_request_limit: z.number().int().positive().nullable().optional(),
    custom_rate_limit: z.number().int().positive().nullable().optional(),
  }).parse(req.body);
  const plan = await prisma.plan.findUnique({ where: { code: body.plan_code.toUpperCase() } });
  if (!plan) throw new AppError("NOT_FOUND", "Plan not found.");
  const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.subscription.upsert({
    where: { clientId: req.params.id },
    create: { clientId: req.params.id, planId: plan.id, status: "ACTIVE", currentPeriodEnd: end, customRequestLimit: body.custom_request_limit ?? null, customRateLimit: body.custom_rate_limit ?? null },
    update: { planId: plan.id, customRequestLimit: body.custom_request_limit ?? null, customRateLimit: body.custom_rate_limit ?? null },
  });
  await audit({ action: "admin.plan_changed", actorUserId: req.user!.id, clientId: req.params.id, targetType: "plan", targetId: plan.id, ip: clientIp(req) });
  res.json({ success: true });
}));

adminRouter.post("/clients/:id/activate-subscription", asyncHandler(async (req, res) => {
  await billing.activateSubscription(req.params.id, req.user!.id);
  res.json({ success: true });
}));

// ---- Plans & fees (editable by the administrator) --------------------------

adminRouter.get("/plans", asyncHandler(async (_req, res) => {
  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
  res.json({ success: true, plans: plans.map(billing.serializePlan) });
}));

adminRouter.patch("/plans/:id", asyncHandler(async (req, res) => {
  const body = z.object({
    name: z.string().min(1).max(60).optional(),
    price: z.number().min(0).nullable().optional(),
    monthly_request_limit: z.number().int().positive().nullable().optional(),
    max_api_keys: z.number().int().positive().nullable().optional(),
    rate_limit_per_minute: z.number().int().positive().nullable().optional(),
    transaction_fee_bps: z.number().int().min(0).max(5000).nullable().optional(),
    features: z.array(z.string().max(60)).max(30).optional(),
    active: z.boolean().optional(),
  }).parse(req.body);
  const data: Prisma.PlanUpdateInput = {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.price !== undefined ? { priceCents: body.price === null ? null : Math.round(body.price * 100) } : {}),
    ...(body.monthly_request_limit !== undefined ? { monthlyRequestLimit: body.monthly_request_limit } : {}),
    ...(body.max_api_keys !== undefined ? { maxApiKeys: body.max_api_keys } : {}),
    ...(body.rate_limit_per_minute !== undefined ? { rateLimitPerMinute: body.rate_limit_per_minute } : {}),
    ...(body.transaction_fee_bps !== undefined ? { transactionFeeBps: body.transaction_fee_bps } : {}),
    ...(body.features !== undefined ? { features: body.features } : {}),
    ...(body.active !== undefined ? { active: body.active } : {}),
  };
  const plan = await prisma.plan.update({ where: { id: req.params.id }, data });
  await audit({ action: "admin.plan_updated", actorUserId: req.user!.id, targetType: "plan", targetId: plan.id, ip: clientIp(req), metadata: { fields: Object.keys(body) } });
  res.json({ success: true, plan: billing.serializePlan(plan) });
}));

const feeSchema = z.object({
  percentageBps: z.number().int().min(0).max(5000),
  fixedFee: z.object({ HTG: z.number().min(0), USD: z.number().min(0) }),
  providerFeeBps: z.number().int().min(0).max(5000),
  minAmount: z.object({ HTG: z.number().positive(), USD: z.number().positive() }),
  maxAmount: z.object({ HTG: z.number().positive(), USD: z.number().positive() }),
});
adminRouter.get("/settings/fees", asyncHandler(async (_req, res) => res.json({ success: true, fees: await getFeeConfig() })));
adminRouter.put("/settings/fees", asyncHandler(async (req, res) => {
  const fees = await saveFeeConfig(feeSchema.parse(req.body));
  await audit({ action: "admin.fees_updated", actorUserId: req.user!.id, ip: clientIp(req) });
  res.json({ success: true, fees });
}));

// ---- Providers ---------------------------------------------------

adminRouter.get("/providers", asyncHandler(async (_req, res) => res.json({ success: true, providers: await listProviders() })));
// Manual connection: an administrator enters the provider credentials here.
// They are encrypted at rest and write-only — responses only ever contain
// masked values (last 4 characters), never a secret.
const providerConfigSchema = z.object({
  name: z.string().trim().max(60).optional(),
  apiUrl: z.string().trim().url().max(300).optional(),
  apiKey: z.string().max(500).optional(),
  secretKey: z.string().max(500).optional(),
  webhookSecret: z.string().max(500).optional(),
});
adminRouter.get("/providers/config", asyncHandler(async (_req, res) => res.json({ success: true, config: await getConfigSummary() })));
adminRouter.put("/providers/config", ipRateLimit(20, "admin-config"), asyncHandler(async (req, res) => {
  res.json({ success: true, config: await saveConfig(providerConfigSchema.parse(req.body), actor(req)) });
}));
adminRouter.delete("/providers/config", asyncHandler(async (req, res) => res.json({ success: true, config: await clearConfig(actor(req)) })));

// "Test Connection": probes the provider from the backend; secrets never leave it.
adminRouter.post("/providers/check", asyncHandler(async (_req, res) => res.json({ success: true, providers: await checkProviders() })));

// ---- Global transactions, logs, audit -------------------------------------

adminRouter.get("/transactions", asyncHandler(async (_req, res) => {
  const rows = await prisma.transaction.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ success: true, transactions: rows.map((t) => ({ id: t.id, client_id: t.clientId, type: t.type.toLowerCase(), provider_transaction_id: t.providerTransactionId, error_code: t.errorCode, provider: t.provider.toLowerCase(), status: t.status.toLowerCase(), environment: t.environment.toLowerCase(), amount: Number(t.amount), currency: t.currency, request_id: t.requestId, created_at: t.createdAt })) });
}));

// Settles LIVE transactions still in flight by asking the provider (also runs daily).
adminRouter.post("/transactions/reconcile", ipRateLimit(10, "admin-reconcile"), asyncHandler(async (_req, res) => {
  res.json({ success: true, ...(await paymentService.reconcileLive(50, 0)) });
}));

// Last resort for a LIVE transaction the provider could not settle, e.g. a transfer
// whose confirmation was lost (it stays PROCESSING with the funds reserved).
adminRouter.post("/transactions/:id/resolve", ipRateLimit(30, "admin-resolve"), asyncHandler(async (req, res) => {
  const body = z.object({ outcome: z.enum(["completed", "failed"]), note: z.string().trim().min(3).max(300) }).parse(req.body);
  const t = await paymentService.resolveManually(req.params.id, body.outcome, actor(req), body.note);
  res.json({ success: true, transaction: paymentService.serializeTransaction(t) });
}));

adminRouter.get("/api-logs", asyncHandler(async (_req, res) => {
  const rows = await prisma.apiLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ success: true, logs: rows });
}));

adminRouter.get("/audit-logs", asyncHandler(async (_req, res) => {
  const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ success: true, logs: rows });
}));

// Suspicious activity: repeated failed logins / rejected API keys per IP recently.
adminRouter.get("/security/suspicious", asyncHandler(async (_req, res) => {
  const [logins, badKeys] = await Promise.all([
    prisma.$queryRaw<{ ip: string; attempts: number }[]>`
      SELECT ip, COUNT(*)::int AS attempts FROM ${tbl("audit_logs")}
      WHERE action = 'auth.login_failed' AND created_at > NOW() - INTERVAL '1 hour' AND ip IS NOT NULL
      GROUP BY ip HAVING COUNT(*) >= 5 ORDER BY attempts DESC LIMIT 50`,
    prisma.$queryRaw<{ ip: string; requests: number }[]>`
      SELECT ip, COUNT(*)::int AS requests FROM ${tbl("api_logs")}
      WHERE status_code = 401 AND created_at > NOW() - INTERVAL '1 hour' AND ip IS NOT NULL
      GROUP BY ip HAVING COUNT(*) >= 20 ORDER BY requests DESC LIMIT 50`,
  ]);
  res.json({ success: true, failed_logins: logins, rejected_api_keys: badKeys });
}));
