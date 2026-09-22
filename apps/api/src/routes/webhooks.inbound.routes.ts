import express, { Router } from "express";
import { PaymentProvider } from "@ayitipay/shared";
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/errors";
import { prisma } from "@/utils/prisma";
import { getAdapter } from "@/providers/provider.factory";
import { getDecryptedCredentials } from "@/services/credential.service";
import { applyWebhookEvent } from "@/services/payment.service";

export const webhooksInboundRouter = Router();

// Raw body is required here (not JSON-parsed) because signature verification
// must run over the exact bytes the provider sent — scoped to this router
// only, mounted ahead of the app-wide express.json() in index.ts.
webhooksInboundRouter.use(express.raw({ type: "*/*" }));

webhooksInboundRouter.post(
  "/:provider/:applicationId",
  asyncHandler(async (req, res) => {
    const provider = req.params.provider.toUpperCase() as PaymentProvider;
    if (provider !== "MONCASH" && provider !== "NATCASH") {
      throw AppError.notFound("Unknown provider.", "UNKNOWN_PROVIDER");
    }

    const credentials = await getDecryptedCredentials(req.params.applicationId, provider);
    if (!credentials) {
      throw AppError.badRequest("No active credentials on file for this application/provider.", "PROVIDER_NOT_CONFIGURED");
    }

    const rawBody = (req.body as Buffer).toString("utf8");
    const adapter = getAdapter(provider);
    const signatureHeader = req.header("X-Signature") ?? req.header("X-Webhook-Signature");

    if (!adapter.verifyWebhookSignature(rawBody, signatureHeader, credentials)) {
      throw AppError.unauthorized("Invalid webhook signature.", "INVALID_SIGNATURE");
    }

    const event = adapter.parseWebhookPayload(JSON.parse(rawBody));
    const transaction = await prisma.transaction.findFirst({
      where: { applicationId: req.params.applicationId, providerPaymentId: event.providerPaymentId },
    });
    if (!transaction) throw AppError.notFound("Transaction not found for this payment id.", "PAYMENT_NOT_FOUND");

    await applyWebhookEvent(transaction, event, "provider_webhook");
    res.status(200).json({ received: true });
  })
);
