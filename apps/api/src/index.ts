import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "@/config/env";
import { authRouter } from "@/routes/auth.routes";
import { portalRouter } from "@/routes/portal.routes";
import { v1PaymentsRouter } from "@/routes/v1.payments.routes";
import { webhooksInboundRouter } from "@/routes/webhooks.inbound.routes";
import { errorHandler } from "@/middleware/errorHandler";
import { startWebhookDeliveryWorker } from "@/workers/webhookDelivery.worker";

const app = express();

app.use(helmet());
app.use(cors({ origin: env.portalAppUrl, credentials: true }));

// Mounted before the global JSON body parser so it can consume the raw,
// unparsed body needed for webhook signature verification.
app.use("/webhooks", webhooksInboundRouter);

app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/auth", authRouter);
app.use("/portal", portalRouter);
app.use("/v1", v1PaymentsRouter);

app.use(errorHandler);

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`AyitiPay API listening on :${env.port}`);
});

startWebhookDeliveryWorker();
