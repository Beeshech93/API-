import { NextFunction, Request, Response } from "express";
import { AppError } from "@/utils/errors";
import { ResolvedApiKey, resolveApiKey } from "@/services/apikey.service";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: ResolvedApiKey;
    }
  }
}

export async function requireApiKey(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(AppError.unauthorized("Missing API key.", "INVALID_API_KEY"));
  }

  try {
    req.apiKey = await resolveApiKey(header.slice("Bearer ".length));
    next();
  } catch (error) {
    next(error);
  }
}

export function requireTestMode(req: Request, _res: Response, next: NextFunction) {
  if (req.apiKey?.mode !== "TEST") {
    return next(AppError.forbidden("This endpoint is only available with a TEST API key.", "MODE_NOT_ALLOWED"));
  }
  next();
}
