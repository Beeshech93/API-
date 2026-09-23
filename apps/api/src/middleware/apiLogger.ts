import { NextFunction, Request, Response } from "express";
import { waitUntil } from "@vercel/functions";
import { writeApiLog } from "@/services/apilog.service";
import { clientIp } from "@/utils/ip";

// Records one metadata row per request to /api/v1 (see apilog.service.ts for
// what is deliberately never stored). `waitUntil` lets the write finish after
// the response is sent on Vercel; elsewhere it is a plain fire-and-forget.
export function apiLogger(req: Request, res: Response, next: NextFunction) {
  res.on("finish", () => {
    const write = writeApiLog({
      requestId: req.ctx.requestId,
      clientId: req.apiAuth?.clientId,
      apiKeyId: req.apiAuth?.apiKeyId,
      endpoint: `${req.baseUrl}${req.route?.path ?? req.path}`.replace(/\/$/, "") || "/",
      method: req.method,
      statusCode: res.statusCode,
      responseMs: Date.now() - req.ctx.startedAt,
      ip: clientIp(req),
      provider: req.ctx.network,
      environment: req.apiAuth?.environment,
    });
    try {
      waitUntil(write);
    } catch {
      void write;
    }
  });
  next();
}
