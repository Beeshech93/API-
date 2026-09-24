import { NextFunction, Request, Response } from "express";
import { prisma } from "@/utils/prisma";
import { env } from "@/config/env";
import { AppError } from "@/utils/errors";
import { authenticate } from "@/services/apikey.service";
import { assertLiveAllowed, getLimits } from "@/services/limits.service";
import { hit } from "@/services/ratelimit.service";
import { consumeRequest } from "@/services/usage.service";

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  const alt = req.headers["x-api-key"];
  return typeof alt === "string" ? alt.trim() : null;
}

// Authenticates the API key, then enforces — in this order — client status,
// LIVE access (LIVE only), and rate limits per client / API key / endpoint.
// LIVE requests are also counted for usage statistics.
export async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    const token = bearer(req);
    if (!token) throw new AppError("INVALID_API_KEY", "Missing API key. Send it as `Authorization: Bearer <key>`.");

    const auth = await authenticate(token);
    req.apiAuth = auth;

    const client = await prisma.client.findUnique({ where: { id: auth.clientId }, select: { status: true, liveEnabled: true, kycStatus: true } });
    if (!client || client.status === "SUSPENDED") throw new AppError("FORBIDDEN", "This account is suspended.");

    const limits = await getLimits();
    if (auth.environment === "LIVE") assertLiveAllowed(limits, client);

    const limit = auth.environment === "LIVE" ? limits.rateLimitPerMinute : env.testRateLimitPerMinute;
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
      await consumeRequest(auth.clientId, null); // usage statistics only: there is no quota
    }
    next();
  } catch (error) {
    next(error);
  }
}

// A key belongs to one API (receiving payments or sending money). Even if its permissions
// were ever edited, it can't be used on the other API. Keys from before the split (BOTH) can.
export function requireCategory(kind: "receive" | "send") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const category = req.apiAuth?.category;
    if (category === "BOTH" || category === (kind === "receive" ? "RECEIVE" : "SEND")) return next();
    next(new AppError("FORBIDDEN", `This key is for the ${category === "SEND" ? "send-money" : "receive-payments"} API, not the ${kind === "receive" ? "receive-payments" : "send-money"} API.`));
  };
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
