import { Request, Response, Router } from "express";
import { env } from "@/config/env";
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/errors";
import { clientIp } from "@/utils/ip";
import { ipRateLimit } from "@/middleware/rateLimit";
import { requireUser } from "@/middleware/auth.jwt";
import { loginSchema, signupSchema } from "@/validators/schemas";
import * as auth from "@/services/auth.service";
import { prisma } from "@/utils/prisma";

export const authRouter = Router();

const COOKIE = "hp_refresh";

function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

// The refresh token lives only in an httpOnly cookie, so page scripts (and any
// XSS) can never read it. It is cross-site in production (portal and API are on
// different domains), hence SameSite=None; CSRF is covered by the Origin check
// on /refresh and /logout below.
function setRefreshCookie(res: Response, token: string, expires: Date) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? "none" : "lax",
    path: "/auth",
    expires,
  });
}

function assertTrustedOrigin(req: Request) {
  const origin = req.headers.origin;
  if (!origin || origin !== env.portalAppUrl) throw new AppError("FORBIDDEN", "Untrusted origin.");
}

function respond(res: Response, session: auth.Session, status = 200) {
  setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
  res.status(status).json({
    success: true,
    access_token: session.accessToken,
    expires_in: env.jwt.accessTtlSeconds,
    user: session.user,
  });
}

const meta = (req: Request) => ({ ip: clientIp(req), userAgent: req.headers["user-agent"] });

authRouter.use(ipRateLimit(30, "auth"));

authRouter.post("/signup", asyncHandler(async (req, res) => {
  respond(res, await auth.signup(signupSchema.parse(req.body), meta(req)), 201);
}));

authRouter.post("/login", asyncHandler(async (req, res) => {
  respond(res, await auth.login(loginSchema.parse(req.body), meta(req)));
}));

authRouter.post("/refresh", asyncHandler(async (req, res) => {
  assertTrustedOrigin(req);
  const token = readCookie(req, COOKIE);
  if (!token) throw new AppError("UNAUTHORIZED", "No session.");
  respond(res, await auth.refresh(token, meta(req)));
}));

authRouter.post("/logout", asyncHandler(async (req, res) => {
  assertTrustedOrigin(req);
  await auth.logout(readCookie(req, COOKIE));
  res.clearCookie(COOKIE, { path: "/auth", secure: env.isProduction, sameSite: env.isProduction ? "none" : "lax" });
  res.json({ success: true });
}));

authRouter.get("/me", requireUser, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw new AppError("UNAUTHORIZED", "Invalid session.");
  res.json({ success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role, clientId: user.clientId } });
}));
