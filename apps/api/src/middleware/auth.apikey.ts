import { NextFunction, Request, Response } from "express";
import { prisma } from "@/utils/prisma";
import { env } from "@/config/env";
import { AppError } from "@/utils/errors";
import { authenticate } from "@/services/apikey.service";
import { getEntitlements } from "@/services/entitlements.service";
import { hit } from "@/services/ratelimit.service";
import { consumeRequest } from "@/services/usage.service";

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  const alt = req.headers["x-api-key"];
  return typeof alt === "string" ? alt.trim() : null;
}

function secondsUntilNextMonth(): number {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

// Authenticates the API key, then enforces — in this order — client status,
// subscription (LIVE only), rate limits per client / API key / endpoint, and
// the monthly request quota (LIVE only). Sandbox (TEST) traffic never consumes
// the paid quota.
export async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    const token = bearer(req);
    if (!token) throw new AppError("INVALID_API_KEY", "Missing API key. Send it as `Authorization: Bearer <key>`.");

    const auth = await authenticate(token);
    req.apiAuth = auth;

    const client = await prisma.client.findUnique({ where: { id: auth.clientId }, select: { status: true } });
    if (!client || client.status === "SUSPENDED") throw new AppError("FORBIDDEN", "This account is suspended.");

    const entitlements = await getEntitlements(auth.clientId);
    if (auth.environment === "LIVE" && !entitlements.active) {
      throw new AppError("SUBSCRIPTION_REQUIRED", "An active subscription is required to use LIVE API keys.");
    }

    const limit = auth.environment === "LIVE" ? entitlements.rateLimitPerMinute : env.testRateLimitPerMinute;
    const isWrite = req.method !== "GET";
    const checks = await Promise.all([
      hit(`client:${auth.clientId}:${auth.environment}`, limit),
      hit(`key:${auth.apiKeyId}`, limit),
      ...(isWrite ? [hit(`endpoint:${auth.apiKeyId}:${req.method}:${req.baseUrl}${req.path}`, Math.max(5, Math.floor(limit / 2)))] : []),
    ]);
    const blocked = checks.find((c) => !c.allowed);
    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, limit - checks[0].count)));
    if (blocked) throw new AppError("RATE_LIMIT_EXCEEDED", "Too many requests", { retryAfter: blocked.retryAfter });

    if (auth.environment === "LIVE") {
      const used = await consumeRequest(auth.clientId, entitlements.monthlyRequestLimit);
      if (used === null) {
        throw new AppError("RATE_LIMIT_EXCEEDED", "Monthly request quota exceeded for your plan.", { retryAfter: secondsUntilNextMonth() });
      }
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.apiAuth?.permissions.includes(permission)) {
      return next(new AppError("FORBIDDEN", `This API key does not have the "${permission}" permission.`));
    }
    next();
  };
}

export function requireAnyPermission(...permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!permissions.some((p) => req.apiAuth?.permissions.includes(p))) {
      return next(new AppError("FORBIDDEN", `This API key needs one of these permissions: ${permissions.join(", ")}.`));
    }
    next();
  };
}
