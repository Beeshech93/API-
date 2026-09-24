import { Router } from "express";
import { env } from "@/config/env";
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/errors";
import { safeEqual } from "@/utils/hmac";
import { pollOnce } from "@/workers/webhookDelivery.worker";
import { checkProviders } from "@/services/provider.service";
import { purgeOldCounters } from "@/services/ratelimit.service";
import { reconcileLive } from "@/services/payment.service";
import { reconcileFundings } from "@/services/funding.service";

export const internalCronRouter = Router();

// Daily maintenance (Vercel Hobby allows one cron run per day): retry failed
// webhook deliveries, refresh provider health, settle in-flight LIVE transactions
// with the provider, purge old rate-limit counters.
// Vercel sends `Authorization: Bearer $CRON_SECRET`; anything else is rejected.
internalCronRouter.get(
  "/webhook-delivery",
  asyncHandler(async (req, res) => {
    const header = req.header("authorization") ?? "";
    if (!env.cronSecret || !safeEqual(header, `Bearer ${env.cronSecret}`)) {
      throw new AppError("UNAUTHORIZED", "Not authorized.");
    }
    const deliveries = await pollOnce();
    await checkProviders();
    const purged = await purgeOldCounters();
    const reconciled = await reconcileLive();
    const fundings = await reconcileFundings();
    res.json({ success: true, ...deliveries, purged_counters: purged, reconciled, fundings });
  })
);
