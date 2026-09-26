import { Request } from "express";

// The address the request really came from. Express works it out from X-Forwarded-For using the
// number of trusted proxies (see `trust proxy` in app.ts), so a value the client makes up itself
// can't be used to dodge the per-IP rate limits.
export function clientIp(req: Request): string | undefined {
  return req.ip ?? req.socket.remoteAddress ?? undefined;
}
