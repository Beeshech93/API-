import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "@/config/env";
import { authRouter } from "@/routes/auth.routes";
import { portalRouter } from "@/routes/portal.routes";
import { v1PaymentsRouter } from "@/routes/v1.payments.routes";
import { webhooksInboundRouter } from "@/routes/webhooks.inbound.routes";
import { internalCronRouter } from "@/routes/internal.cron.routes";
import { errorHandler } from "@/middleware/errorHandler";

// Builds the Express app without starting a listener or the background
// worker — both `server.ts` (local/long-running host) and `api/index.ts`
// (Vercel serverless entrypoint) import this and decide separately how to
// run it.
export function createApp() {
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
  app.use("/internal/cron", internalCronRouter);

  app.use(errorHandler);

  return app;
}
