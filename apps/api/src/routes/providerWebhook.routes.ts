import { Router } from "express";
import { prisma } from "@/utils/prisma";
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/errors";
import { ipRateLimit } from "@/middleware/rateLimit";
import { getEffectiveConfig } from "@/services/providerConfig.service";
import { verifyProviderWebhook } from "@/providers/live.webhook";
import { syncFromProvider } from "@/services/payment.service";

export const providerWebhookRouter = Router();

// Notifications from the payment provider. Nothing in the body is trusted: the
// signature must verify against the administrator's webhook secret, and even then
// the outcome is re-read from the provider before any transaction changes state.
// A forged or replayed notification can therefore never complete a payment.
providerWebhookRouter.post(
  "/",
  ipRateLimit(120, "provider-webhook"),
  asyncHandler(async (req, res) => {
    const config = await getEffectiveConfig();
    const raw = (req as unknown as { rawBody?: string }).rawBody ?? "";
    if (!verifyProviderWebhook(req.headers, raw, config.webhookSecret).ok) {
      throw new AppError("UNAUTHORIZED", "Invalid signature.");
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const ids = [body.orderId, body.transactionId].filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 200);
    const transaction = ids.length
      ? await prisma.transaction.findFirst({ where: { environment: "LIVE", providerTransactionId: { in: ids } } })
      : null;

    if (transaction) {
      const { reached } = await syncFromProvider(transaction, "provider_webhook");
      // Couldn't confirm with the provider right now: ask it to deliver again.
      if (!reached) return res.status(503).json({ received: false });
    }
    // Unknown ids are acknowledged too, so the provider doesn't keep retrying.
    res.json({ received: true });
  })
);
