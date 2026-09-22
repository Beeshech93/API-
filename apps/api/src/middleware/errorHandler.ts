import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "@/utils/errors";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: err.issues.map((issue) => issue.message).join("; ") },
    });
  }

  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
}
