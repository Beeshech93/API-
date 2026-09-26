import { NextFunction, Request, Response } from "express";
import { AppError } from "@/utils/errors";
import { prisma } from "@/utils/prisma";
import { verifyAccessToken } from "@/utils/jwt";

// The token proves who the caller is; what they may do is read from the database on every request,
// not trusted from the token — so suspending an account, or taking away administrator rights, takes
// effect immediately instead of when the (up to 15 minute) access token expires.
export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(new AppError("UNAUTHORIZED", "Missing access token."));
  let sub: string;
  try {
    sub = verifyAccessToken(header.slice(7)).sub;
  } catch {
    return next(new AppError("UNAUTHORIZED", "Invalid or expired session."));
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: sub }, select: { id: true, role: true, clientId: true, client: { select: { status: true } } } });
    if (!user) return next(new AppError("UNAUTHORIZED", "Invalid or expired session."));
    if (user.client.status === "SUSPENDED") return next(new AppError("FORBIDDEN", "This account is suspended. Contact support."));
    req.user = { id: user.id, clientId: user.clientId, role: user.role };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN") return next(new AppError("FORBIDDEN", "Administrator access required."));
  next();
}
