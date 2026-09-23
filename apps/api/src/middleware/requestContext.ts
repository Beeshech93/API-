import { NextFunction, Request, Response } from "express";
import { newRequestId } from "@/utils/ids";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      ctx: { requestId: string; startedAt: number; network?: string };
      apiAuth?: import("@/services/apikey.service").AuthenticatedKey;
      user?: { id: string; clientId: string; role: "USER" | "ADMIN" };
    }
  }
}

export function requestContext(req: Request, res: Response, next: NextFunction) {
  req.ctx = { requestId: newRequestId(), startedAt: Date.now() };
  res.setHeader("X-Request-Id", req.ctx.requestId);
  next();
}
