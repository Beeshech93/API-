import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/errors";
import { clientIp } from "@/utils/ip";
import { prisma } from "@/utils/prisma";
import { tbl } from "@/utils/sql";
import { requireAdmin, requireUser } from "@/middleware/auth.jwt";
import { ipRateLimit } from "@/middleware/rateLimit";
import { audit } from "@/services/audit.service";
import { getFeeConfig, saveFeeConfig } from "@/services/fee.service";
import { getLimits, saveLimits } from "@/services/limits.service";
import * as fundingService from "@/services/funding.service";
import * as kycService from "@/services/kyc.service";
import { kycDocumentTypeSchema } from "@/validators/schemas";
import { checkProviders, listProviders } from "@/services/provider.service";
import { assertRole, clearConfig, getConfigSummary, saveConfig } from "@/services/providerConfig.service";
import { getUsage } from "@/services/usage.service";
import * as paymentService from "@/services/payment.service";
import { adminCreateClientSchema, servicesSchema } from "@/validators/schemas";

export const adminRouter = Router();
adminRouter.use(requireUser, requireAdmin);

const actor = (req: import("express").Request) => ({ userId: req.user!.id, ip: clientIp(req) });

adminRouter.get("/overview", asyncHandler(async (_req, res) => {
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [clients, liveClients, pendingFundings, pendingKyc, requests, tx, failed, volume, providers] = await Promise.all([
    prisma.client.count(),
    prisma.client.count({ where: { liveEnabled: true } }),
    prisma.funding.count({ where: { status: "PENDING", method: { not: "MONCASH" } } }),
    prisma.client.count({ where: { kycStatus: "PENDING" } }),
    prisma.usageRecord.aggregate({ where: { period: `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, "0")}` }, _sum: { requests: true } }),
    prisma.transaction.count({ where: { environment: "LIVE" } }),
    prisma.transaction.count({ where: { environment: "LIVE", status: "FAILED" } }),
    prisma.transaction.groupBy({ by: ["provider", "currency"], where: { environment: "LIVE", status: "COMPLETED" }, _sum: { amount: true } }),
    listProviders(),
  ]);
  res.json({
    success: true,
    total_clients: clients,
    live_clients: liveClients,
    pending_fundings: pendingFundings,
    pending_kyc: pendingKyc,
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
    include: { users: { select: { email: true, role: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({
    success: true,
    clients: clients.map((c) => ({
      id: c.id, name: c.name, status: c.status.toLowerCase(), created_at: c.createdAt,
      users: c.users, live_enabled: c.liveEnabled, kyc_status: c.kycStatus.toLowerCase(), services: { receive: c.canReceive, send: c.canSend },
    })),
  });
}));

adminRouter.get("/clients/:id", asyncHandler(async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: { users: { select: { id: true, email: true, name: true, role: true, createdAt: true } }, apiKeys: true },
  });
  if (!client) throw new AppError("NOT_FOUND", "Client not found.");
  const [usage, transactions, logs] = await Promise.all([
    getUsage(client.id),
    prisma.transaction.findMany({ where: { clientId: client.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.apiLog.findMany({ where: { clientId: client.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  res.json({
    success: true,
    client: { id: client.id, name: client.name, status: client.status.toLowerCase(), live_enabled: client.liveEnabled, kyc_status: client.kycStatus.toLowerCase(), services: { receive: client.canReceive, send: client.canSend }, created_at: client.createdAt },
    users: client.users,
    api_keys: client.apiKeys.map((k) => ({ id: k.id, name: k.name, category: k.category.toLowerCase(), environment: k.environment.toLowerCase(), last4: k.last4, status: k.revokedAt ? "revoked" : "active", last_used_at: k.lastUsedAt })),
    usage,
    transactions: transactions.map((t) => ({ id: t.id, provider: t.provider.toLowerCase(), status: t.status.toLowerCase(), amount: Number(t.amount), currency: t.currency, created_at: t.createdAt })),
    logs: logs.map((l) => ({ request_id: l.requestId, endpoint: l.endpoint, method: l.method, status_code: l.statusCode, created_at: l.createdAt })),
  });
}));

adminRouter.post("/clients", asyncHandler(async (req, res) => {
  const body = adminCreateClientSchema.parse(req.body);
  if (await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } })) throw new AppError("CONFLICT", "Email already registered.");
  const passwordHash = await bcrypt.hash(body.password, 12);
  const created = await prisma.$transaction(async (tx) => {
    const client = await tx.client.create({ data: { name: body.name, canReceive: body.services.includes("receive"), canSend: body.services.includes("send") } });
    await tx.user.create({ data: { clientId: client.id, email: body.email.toLowerCase(), passwordHash, name: body.name } });
    return client;
  });
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

// What the account is set up for (receiving payments and/or sending money).
adminRouter.post("/clients/:id/services", asyncHandler(async (req, res) => {
  const { services } = z.object({ services: servicesSchema }).parse(req.body);
  const client = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!client) throw new AppError("NOT_FOUND", "Client not found.");
  const canReceive = services.includes("receive"), canSend = services.includes("send");
  await prisma.client.update({ where: { id: client.id }, data: { canReceive, canSend } });
  await audit({ action: "admin.client_services_changed", actorUserId: req.user!.id, clientId: client.id, ip: clientIp(req), metadata: { receive: canReceive, send: canSend } });
  res.json({ success: true, services: { receive: canReceive, send: canSend } });
}));

// Enables or disables LIVE access for a client (see settings/limits).
adminRouter.post("/clients/:id/live-access", asyncHandler(async (req, res) => {
  const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
  const client = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!client) throw new AppError("NOT_FOUND", "Client not found.");
  // LIVE can only be opened for a verified client.
  if (enabled && client.kycStatus !== "APPROVED") throw new AppError("CONFLICT", "This client has not passed identity verification (KYC) yet.");
  await prisma.client.update({ where: { id: client.id }, data: { liveEnabled: enabled } });
  await audit({ action: enabled ? "admin.live_access_enabled" : "admin.live_access_disabled", actorUserId: req.user!.id, clientId: client.id, ip: clientIp(req) });
  res.json({ success: true, live_enabled: enabled });
}));

// ---- Fees & limits (editable by the administrator) -------------------------

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

const limitsSchema = z.object({
  rateLimitPerMinute: z.number().int().min(1).max(100_000),
  maxLiveKeys: z.number().int().min(1).max(1000),
  requireLiveApproval: z.boolean(),
});
adminRouter.get("/settings/limits", asyncHandler(async (_req, res) => res.json({ success: true, limits: await getLimits() })));
adminRouter.put("/settings/limits", asyncHandler(async (req, res) => {
  const limits = await saveLimits(limitsSchema.parse(req.body));
  await audit({ action: "admin.limits_updated", actorUserId: req.user!.id, ip: clientIp(req), metadata: { ...limits } });
  res.json({ success: true, limits });
}));

// ---- Identity verification (KYC) review ---------------------------------------

const kycStatusFilter = z.enum(["pending", "approved", "rejected"]);
adminRouter.get("/kyc", asyncHandler(async (req, res) => {
  const status = typeof req.query.status === "string" ? (kycStatusFilter.parse(req.query.status).toUpperCase() as "PENDING") : undefined;
  res.json({ success: true, submissions: await kycService.listKyc(status) });
}));
adminRouter.get("/kyc/:clientId", asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await kycService.getKycForReview(req.params.clientId, actor(req))) });
}));
// The photo itself. Sent with headers that keep it out of caches and stop it being interpreted as anything but an image.
adminRouter.get("/kyc/:clientId/documents/:type", ipRateLimit(120, "admin-kyc-doc"), asyncHandler(async (req, res) => {
  const doc = await kycService.getDocumentForReview(req.params.clientId, kycDocumentTypeSchema.parse(req.params.type), actor(req));
  res.setHeader("Content-Type", doc.mime);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'");
  res.send(doc.bytes);
}));
adminRouter.post("/kyc/:clientId/approve", ipRateLimit(60, "admin-kyc"), asyncHandler(async (req, res) => {
  const { note } = z.object({ note: z.string().trim().max(300).optional() }).parse(req.body ?? {});
  await kycService.approveKyc(req.params.clientId, actor(req), note);
  res.json({ success: true });
}));
adminRouter.post("/kyc/:clientId/reject", ipRateLimit(60, "admin-kyc"), asyncHandler(async (req, res) => {
  const { note } = z.object({ note: z.string().trim().min(5).max(500) }).parse(req.body ?? {});
  await kycService.rejectKyc(req.params.clientId, actor(req), note);
  res.json({ success: true });
}));
adminRouter.post("/kyc/:clientId/revoke", ipRateLimit(60, "admin-kyc"), asyncHandler(async (req, res) => {
  const { note } = z.object({ note: z.string().trim().min(5).max(500) }).parse(req.body ?? {});
  await kycService.revokeKyc(req.params.clientId, actor(req), note);
  res.json({ success: true });
}));

// ---- Funding (balance recharges) ---------------------------------------------

const methodConfigSchema = z.object({ enabled: z.boolean(), minAmount: z.number().min(1).max(10_000_000), instructions: z.string().max(2000) });
const fundingConfigSchema = z.object({
  MONCASH: methodConfigSchema, NATCASH: methodConfigSchema, ZELLE: methodConfigSchema,
  BANK_DEPOSIT: methodConfigSchema, BANK_TRANSFER: methodConfigSchema, CRYPTO_USDT: methodConfigSchema,
});
adminRouter.get("/settings/funding", asyncHandler(async (_req, res) => res.json({ success: true, methods: await fundingService.getFundingConfig() })));
adminRouter.put("/settings/funding", asyncHandler(async (req, res) => {
  const methods = await fundingService.saveFundingConfig(fundingConfigSchema.parse(req.body));
  await audit({ action: "admin.funding_methods_updated", actorUserId: req.user!.id, ip: clientIp(req), metadata: { enabled: Object.entries(methods).filter(([, m]) => m.enabled).map(([k]) => k) } });
  res.json({ success: true, methods });
}));

adminRouter.get("/funding", asyncHandler(async (req, res) => {
  const status = typeof req.query.status === "string" ? z.enum(["pending", "completed", "failed", "rejected"]).parse(req.query.status).toUpperCase() as "PENDING" : undefined;
  res.json({ success: true, fundings: await fundingService.listAllFundings(status) });
}));
adminRouter.post("/funding/:id/approve", ipRateLimit(60, "admin-funding"), asyncHandler(async (req, res) => {
  const body = z.object({ amount: z.number().positive().optional(), note: z.string().trim().max(300).optional() }).parse(req.body ?? {});
  res.json({ success: true, funding: fundingService.serializeFunding(await fundingService.approveFunding(req.params.id, { userId: req.user!.id }, body)) });
}));
adminRouter.post("/funding/:id/reject", ipRateLimit(60, "admin-funding"), asyncHandler(async (req, res) => {
  const { note } = z.object({ note: z.string().trim().min(3).max(300) }).parse(req.body ?? {});
  res.json({ success: true, funding: fundingService.serializeFunding(await fundingService.rejectFunding(req.params.id, { userId: req.user!.id }, note)) });
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
// ?role=receive (default) or ?role=send: separate provider credentials for collecting
// payments and for sending money. Without send credentials, sending reuses the receive ones.
adminRouter.get("/providers/config", asyncHandler(async (req, res) => res.json({ success: true, config: await getConfigSummary(assertRole(req.query.role)) })));
adminRouter.put("/providers/config", ipRateLimit(20, "admin-config"), asyncHandler(async (req, res) => {
  res.json({ success: true, config: await saveConfig(providerConfigSchema.parse(req.body), actor(req), assertRole(req.query.role)) });
}));
adminRouter.delete("/providers/config", asyncHandler(async (req, res) => res.json({ success: true, config: await clearConfig(actor(req), assertRole(req.query.role)) })));

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
