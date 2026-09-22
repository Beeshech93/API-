import { NextFunction, Request, Response } from "express";
import { AppError } from "@/utils/errors";
import { verifyDeveloperToken } from "@/utils/jwt";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      developer?: { id: string; email: string };
    }
  }
}

export function requireDeveloperAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(AppError.unauthorized("Missing bearer token.", "UNAUTHENTICATED"));
  }

  try {
    const payload = verifyDeveloperToken(header.slice("Bearer ".length));
    req.developer = { id: payload.developerId, email: payload.email };
    next();
  } catch {
    next(AppError.unauthorized("Invalid or expired session.", "UNAUTHENTICATED"));
  }
}
