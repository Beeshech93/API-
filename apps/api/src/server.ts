import { env } from "@/config/env";
import { createApp } from "@/app";
import { startWebhookDeliveryWorker } from "@/workers/webhookDelivery.worker";

// Local dev / any long-running host (not Vercel): a real listening server
// plus the in-process polling worker. On Vercel, `api/index.ts` exports the
// app directly instead and a Cron job drives webhook delivery (see
// internal.cron.routes.ts) since there's no persistent process to poll from.
const app = createApp();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`AyitiPay API listening on :${env.port}`);
});

startWebhookDeliveryWorker();
