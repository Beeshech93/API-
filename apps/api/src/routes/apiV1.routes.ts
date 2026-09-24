import { Router } from "express";
import { z } from "zod";
import { Network } from "@prisma/client";
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/errors";
import { requireApiKey, requireAnyPermission, requirePermission } from "@/middleware/auth.apikey";
import { apiLogger } from "@/middleware/apiLogger";
import { ipRateLimit } from "@/middleware/rateLimit";
import {
  createPaymentSchema, createTransferSchema, idempotencyKeySchema, listQuerySchema, quoteQuerySchema, simulateSchema,
} from "@/validators/schemas";
import { computeQuote, assertAmountInRange, getFeeConfig } from "@/services/fee.service";
import * as payments from "@/services/payment.service";
import { sandboxFund } from "@/services/funding.service";
import { prisma } from "@/utils/prisma";

export const apiV1Router = Router();

apiV1Router.use(apiLogger);
apiV1Router.use(ipRateLimit());

const VERSION = "1.0.0";

apiV1Router.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "HaitiPay API", version: VERSION });
});

apiV1Router.get(
  "/quote",
  requireApiKey,
  requirePermission("payments:read"),
  asyncHandler(async (req, res) => {
    const q = quoteQuerySchema.parse(req.query);
    const config = await getFeeConfig();
    assertAmountInRange(q.amount, q.currency, config);
    res.json(computeQuote(q.amount, q.currency, config));
  })
);

apiV1Router.post(
  "/sandbox/transactions/:id/simulate",
  requireApiKey,
  requireAnyPermission("payments:create", "transfers:create"),
  asyncHandler(async (req, res) => {
    const { outcome } = simulateSchema.parse(req.body);
    const t = await payments.simulateTransaction(
      { clientId: req.apiAuth!.clientId, apiKeyId: req.apiAuth!.apiKeyId, environment: req.apiAuth!.environment, requestId: req.ctx.requestId },
      req.params.id,
      outcome
    );
    res.json(payments.serializeTransaction(t));
  })
);

// Sandbox only: simulated money for a TEST balance, so an account that only sends money
// can try transfers. It never touches a real balance.
apiV1Router.post(
  "/sandbox/fund",
  requireApiKey,
  requirePermission("transfers:create"),
  asyncHandler(async (req, res) => {
    if (req.apiAuth!.environment !== "TEST") throw new AppError("FORBIDDEN", "Sandbox funding is only available with a TEST API key.");
    const account = await prisma.client.findUnique({ where: { id: req.apiAuth!.clientId }, select: { canSend: true } });
    if (!account?.canSend) throw new AppError("FORBIDDEN", "This account is not set up to send money.");
    const { amount, currency } = z.object({ amount: z.number().positive(), currency: z.enum(["HTG", "USD"]).default("HTG") }).parse(req.body);
    await sandboxFund(req.apiAuth!.clientId, amount, currency);
    res.status(201).json({ success: true, environment: "test", balances: await payments.getCollectedBalance(req.apiAuth!.clientId, "TEST") });
  })
);

const NETWORKS: Record<string, Network> = { moncash: "MONCASH", natcash: "NATCASH" };

// /api/v1/moncash/* and /api/v1/natcash/* expose the same operations.
const network = Router({ mergeParams: true });

network.use((req, _res, next) => {
  const resolved = NETWORKS[req.params.network];
  if (!resolved) return next(new AppError("NOT_FOUND", "Unknown provider."));
  req.ctx.network = req.params.network;
  next();
});
network.use(requireApiKey);

network.post(
  "/payments",
  requirePermission("payments:create"),
  asyncHandler(async (req, res) => {
    // Financial operations require an Idempotency-Key so a retried request can
    // never create a second payment.
    const key = idempotencyKeySchema.parse(req.header("Idempotency-Key"));
    const body = createPaymentSchema.parse(req.body);
    const { transaction, replayed } = await payments.createPayment(
      { clientId: req.apiAuth!.clientId, apiKeyId: req.apiAuth!.apiKeyId, environment: req.apiAuth!.environment, requestId: req.ctx.requestId },
      NETWORKS[req.params.network],
      body,
      key
    );
    if (replayed) res.setHeader("Idempotent-Replayed", "true");
    res.status(replayed ? 200 : 201).json(payments.serializeTransaction(transaction));
  })
);

// Sending money out. Draws only on the client's own collected balance.
network.post(
  "/transfers",
  requirePermission("transfers:create"),
  asyncHandler(async (req, res) => {
    const key = idempotencyKeySchema.parse(req.header("Idempotency-Key"));
    const body = createTransferSchema.parse(req.body);
    const { transaction, replayed } = await payments.createTransfer(
      { clientId: req.apiAuth!.clientId, apiKeyId: req.apiAuth!.apiKeyId, environment: req.apiAuth!.environment, requestId: req.ctx.requestId },
      NETWORKS[req.params.network],
      body,
      key
    );
    if (replayed) res.setHeader("Idempotent-Replayed", "true");
    res.status(replayed ? 200 : 201).json(payments.serializeTransaction(transaction));
  })
);

network.get(
  "/transfers/:id",
  requirePermission("transfers:read"),
  asyncHandler(async (req, res) => {
    const t = await payments.getTransaction(req.apiAuth!.clientId, req.apiAuth!.environment, req.params.id, NETWORKS[req.params.network], { refresh: true });
    if (t.type !== "TRANSFER") throw new AppError("TRANSACTION_NOT_FOUND", "Transaction not found.");
    res.json(payments.serializeTransaction(t));
  })
);

network.get(
  "/transfers",
  requirePermission("transfers:read"),
  asyncHandler(async (req, res) => {
    const q = listQuerySchema.parse(req.query);
    const rows = await payments.listTransactions(req.apiAuth!.clientId, req.apiAuth!.environment, {
      network: NETWORKS[req.params.network], type: "TRANSFER", status: q.status?.toUpperCase() as never, limit: q.limit, before: q.before ? new Date(q.before) : undefined,
    });
    res.json({ success: true, transfers: rows.map(payments.serializeTransaction), has_more: rows.length === q.limit });
  })
);

network.get(
  "/transactions/:id",
  requirePermission("transactions:read"),
  asyncHandler(async (req, res) => {
    const t = await payments.getTransaction(req.apiAuth!.clientId, req.apiAuth!.environment, req.params.id, NETWORKS[req.params.network], { refresh: true });
    res.json(payments.serializeTransaction(t));
  })
);

network.get(
  "/balance",
  requirePermission("balance:read"),
  asyncHandler(async (req, res) => {
    const balances = await payments.getCollectedBalance(req.apiAuth!.clientId, req.apiAuth!.environment);
    res.json({ success: true, provider: req.params.network, environment: req.apiAuth!.environment.toLowerCase(), balances });
  })
);

network.get(
  "/transactions",
  requirePermission("transactions:read"),
  asyncHandler(async (req, res) => {
    const q = listQuerySchema.parse(req.query);
    const rows = await payments.listTransactions(req.apiAuth!.clientId, req.apiAuth!.environment, {
      network: NETWORKS[req.params.network],
      type: typeof req.query.type === "string" && ["payment", "transfer"].includes(req.query.type) ? (req.query.type.toUpperCase() as "PAYMENT" | "TRANSFER") : undefined,
      status: q.status?.toUpperCase() as never,
      limit: q.limit,
      before: q.before ? new Date(q.before) : undefined,
    });
    res.json({ success: true, transactions: rows.map(payments.serializeTransaction), has_more: rows.length === q.limit });
  })
);

apiV1Router.use("/:network(moncash|natcash)", network);

apiV1Router.use((_req, _res, next) => next(new AppError("NOT_FOUND", "Endpoint not found.")));
