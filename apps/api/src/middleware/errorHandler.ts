import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError, ErrorCode } from "@/utils/errors";

function body(code: ErrorCode, message: string, requestId: string, retryAfter?: number) {
  return {
    success: false,
    error: { code, message, request_id: requestId, ...(retryAfter ? { retry_after: retryAfter } : {}) },
  };
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.ctx?.requestId ?? "req_unknown";

  if (err instanceof AppError) {
    if (err.retryAfter) res.setHeader("Retry-After", String(err.retryAfter));
    return res.status(err.status).json(body(err.code, err.message, requestId, err.retryAfter));
  }

  if (err instanceof ZodError) {
    const first = err.issues[0];
    const field = String(first?.path[0] ?? "");
    const code: ErrorCode = field === "phone" ? "INVALID_PHONE" : field === "amount" ? "INVALID_AMOUNT" : "INVALID_REQUEST";
    const message = err.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ");
    return res.status(400).json(body(code, message, requestId));
  }

  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json(body("INVALID_REQUEST", "Malformed JSON body.", requestId));
  }

  // Unknown errors are logged server-side only; the client never sees internals.
  console.error(`[${requestId}]`, err);
  return res.status(500).json(body("INTERNAL_ERROR", "Something went wrong.", requestId));
}
