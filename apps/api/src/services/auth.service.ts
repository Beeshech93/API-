import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/utils/prisma";
import { env } from "@/config/env";
import { AppError } from "@/utils/errors";
import { signAccessToken } from "@/utils/jwt";
import { audit } from "@/services/audit.service";

const BCRYPT_COST = 12;
// Compared against when the email is unknown, so login timing doesn't reveal
// whether an account exists.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", BCRYPT_COST);

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  refreshTokenId: string;
  user: { id: string; email: string; name: string; role: "USER" | "ADMIN"; clientId: string };
}

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

async function issueSession(
  user: { id: string; email: string; name: string; role: "USER" | "ADMIN"; clientId: string },
  meta: SessionMeta,
  familyId: string = crypto.randomUUID()
): Promise<Session> {
  const refreshToken = crypto.randomBytes(48).toString("base64url");
  const refreshExpiresAt = new Date(Date.now() + env.jwt.refreshTtlDays * 24 * 60 * 60 * 1000);
  const record = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      familyId,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiresAt,
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 300),
    },
  });
  const accessToken = signAccessToken({ sub: user.id, clientId: user.clientId, role: user.role });
  return { accessToken, refreshToken, refreshExpiresAt, refreshTokenId: record.id, user };
}

export async function signup(input: { email: string; password: string; name: string }, meta: SessionMeta): Promise<Session> {
  const email = input.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError("CONFLICT", "An account with that email already exists.");

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  const user = await prisma.$transaction(async (tx) => {
    const client = await tx.client.create({ data: { name: input.name } });
    return tx.user.create({ data: { clientId: client.id, email, passwordHash, name: input.name } });
  });

  await audit({ action: "auth.signup", actorUserId: user.id, clientId: user.clientId, ip: meta.ip });
  return issueSession({ id: user.id, email: user.email, name: user.name, role: user.role, clientId: user.clientId }, meta);
}

export async function login(input: { email: string; password: string }, meta: SessionMeta): Promise<Session> {
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() }, include: { client: true } });
  const valid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) {
    await audit({ action: "auth.login_failed", ip: meta.ip, metadata: { email: input.email.toLowerCase() } });
    throw new AppError("UNAUTHORIZED", "Invalid email or password.");
  }
  if (user.client.status === "SUSPENDED") {
    throw new AppError("FORBIDDEN", "This account is suspended. Contact support.");
  }
  await audit({ action: "auth.login", actorUserId: user.id, clientId: user.clientId, ip: meta.ip });
  return issueSession({ id: user.id, email: user.email, name: user.name, role: user.role, clientId: user.clientId }, meta);
}

// Refresh tokens rotate on every use. Presenting an already-used token means it
// was stolen or replayed, so the whole token family is revoked.
export async function refresh(refreshToken: string, meta: SessionMeta): Promise<Session> {
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: { user: { include: { client: true } } },
  });
  if (!record) throw new AppError("UNAUTHORIZED", "Invalid session.");

  if (record.revokedAt) {
    await prisma.refreshToken.updateMany({ where: { familyId: record.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit({ action: "auth.refresh_reuse_detected", actorUserId: record.userId, clientId: record.user.clientId, ip: meta.ip });
    throw new AppError("UNAUTHORIZED", "Session expired. Please sign in again.");
  }
  if (record.expiresAt.getTime() < Date.now() || record.user.client.status === "SUSPENDED") {
    throw new AppError("UNAUTHORIZED", "Session expired. Please sign in again.");
  }

  const user = record.user;
  const session = await issueSession(
    { id: user.id, email: user.email, name: user.name, role: user.role, clientId: user.clientId },
    meta,
    record.familyId
  );
  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date(), replacedById: session.refreshTokenId },
  });
  return session;
}

export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  await prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
}
