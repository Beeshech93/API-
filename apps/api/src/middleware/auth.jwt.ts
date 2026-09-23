import { NextFunction, Request, Response } from "express";
import { AppError } from "@/utils/errors";
import { verifyAccessToken } from "@/utils/jwt";

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(new AppError("UNAUTHORIZED", "Missing access token."));
  try {
    const payload = verifyAccessToken(header.slice(7));
    req.user = { id: payload.sub, clientId: payload.clientId, role: payload.role };
    next();
  } catch {
    next(new AppError("UNAUTHORIZED", "Invalid or expired session."));
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN") return next(new AppError("FORBIDDEN", "Administrator access required."));
  next();
}
