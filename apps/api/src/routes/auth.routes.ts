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
// XSS) can never read it. The portal reaches this API through a same-origin
// proxy, which makes it a first-party cookie (SameSite=Lax is enough — browsers
// block cross-site cookies between *.vercel.app domains). CSRF is covered by the
// Origin check on /refresh and /logout below.
const COOKIE_OPTIONS = { httpOnly: true, secure: env.isProduction, sameSite: "lax" as const, path: "/" };

function setRefreshCookie(res: Response, token: string, expires: Date) {
  res.cookie(COOKIE, token, { ...COOKIE_OPTIONS, expires });
}

function assertTrustedOrigin(req: Request) {
  const origin = req.headers.origin;
  if (!origin || !env.portalAppUrls.includes(origin)) throw new AppError("FORBIDDEN", "Untrusted origin.");
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

// Each route has its own counter: the portal refreshes its session on every page load, which
// must not eat into the (much stricter) allowance for signing in or creating accounts.
const limit = {
  signup: ipRateLimit(10, "auth-signup"),
  login: ipRateLimit(20, "auth-login"),
  refresh: ipRateLimit(180, "auth-refresh"),
  logout: ipRateLimit(60, "auth-logout"),
  me: ipRateLimit(180, "auth-me"),
};

authRouter.post("/signup", limit.signup, asyncHandler(async (req, res) => {
  respond(res, await auth.signup(signupSchema.parse(req.body), meta(req)), 201);
}));

authRouter.post("/login", limit.login, asyncHandler(async (req, res) => {
  respond(res, await auth.login(loginSchema.parse(req.body), meta(req)));
}));

authRouter.post("/refresh", limit.refresh, asyncHandler(async (req, res) => {
  assertTrustedOrigin(req);
  const token = readCookie(req, COOKIE);
  if (!token) throw new AppError("UNAUTHORIZED", "No session.");
  respond(res, await auth.refresh(token, meta(req)));
}));

authRouter.post("/logout", limit.logout, asyncHandler(async (req, res) => {
  assertTrustedOrigin(req);
  await auth.logout(readCookie(req, COOKIE));
  res.clearCookie(COOKIE, COOKIE_OPTIONS);
  res.json({ success: true });
}));

authRouter.get("/me", limit.me, requireUser, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw new AppError("UNAUTHORIZED", "Invalid session.");
  res.json({ success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role, clientId: user.clientId } });
}));
