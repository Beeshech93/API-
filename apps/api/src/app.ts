import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "@/config/env";
import { requestContext } from "@/middleware/requestContext";
import { errorHandler } from "@/middleware/errorHandler";
import { apiV1Router } from "@/routes/apiV1.routes";
import { authRouter } from "@/routes/auth.routes";
import { portalRouter } from "@/routes/portal.routes";
import { adminRouter } from "@/routes/admin.routes";
import { internalCronRouter } from "@/routes/internal.cron.routes";
import { providerWebhookRouter } from "@/routes/providerWebhook.routes";
import { AppError } from "@/utils/errors";

// Builds the Express app without listening or starting workers, so `server.ts`
// (long-running host) and the Vercel entrypoint can each decide how to run it.
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(requestContext);
  app.use(helmet());
  // Only the HaitiPay dashboard origin may call this API from a browser.
  app.use(cors({ origin: env.portalAppUrls, credentials: true }));
  // The raw body is kept so provider notifications can be signature-checked.
  app.use(
    express.json({
      limit: "100kb",
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody?: string }).rawBody = buf.toString("utf8");
      },
    })
  );

  app.use("/api/v1", apiV1Router);
  app.use("/auth", authRouter);
  app.use("/portal", portalRouter);
  app.use("/admin", adminRouter);
  app.use("/internal/cron", internalCronRouter);
  app.use("/webhooks/provider", providerWebhookRouter);

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use((_req, _res, next) => next(new AppError("NOT_FOUND", "Endpoint not found.")));
  app.use(errorHandler);
  return app;
}
