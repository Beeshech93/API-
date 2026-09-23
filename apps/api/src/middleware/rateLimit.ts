import { NextFunction, Request, Response } from "express";
import { env } from "@/config/env";
import { AppError } from "@/utils/errors";
import { clientIp } from "@/utils/ip";
import { hit } from "@/services/ratelimit.service";

// Per-IP limiter, applied before any authentication so unauthenticated floods
// can't reach the database-heavy paths.
export function ipRateLimit(limitPerMinute = env.ipRateLimitPerMinute, scope = "ip") {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const result = await hit(`${scope}:${clientIp(req) ?? "unknown"}`, limitPerMinute);
      if (!result.allowed) {
        throw new AppError("RATE_LIMIT_EXCEEDED", "Too many requests", { retryAfter: result.retryAfter });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
