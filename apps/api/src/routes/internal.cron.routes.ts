import { Router } from "express";
import { env } from "@/config/env";
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/errors";
import { pollOnce } from "@/workers/webhookDelivery.worker";

export const internalCronRouter = Router();

// Triggered by Vercel Cron (see vercel.json). Vercel signs cron requests with
// `Authorization: Bearer $CRON_SECRET` automatically — this route is
// otherwise indistinguishable from any other public endpoint, so it must
// reject anything that doesn't carry that exact secret. Local dev doesn't
// hit this at all: `startWebhookDeliveryWorker()` runs the same `pollOnce()`
// on a plain setInterval instead, since CRON_SECRET is unset there.
internalCronRouter.get(
  "/webhook-delivery",
  asyncHandler(async (req, res) => {
    if (!env.cronSecret || req.header("authorization") !== `Bearer ${env.cronSecret}`) {
      throw AppError.unauthorized("Not authorized.", "UNAUTHENTICATED");
    }
    const result = await pollOnce();
    res.json(result);
  })
);
