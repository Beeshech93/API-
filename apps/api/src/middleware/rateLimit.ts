import rateLimit from "express-rate-limit";
import { Request } from "express";
import { env } from "@/config/env";

// Keyed on the resolved API key (set by requireApiKey, which must run first),
// falling back to IP only if somehow no key is attached yet. v1 uses the
// default in-memory store, which is fine for a single-instance deploy; a
// Redis store is the scaling upgrade if the API ever runs with >1 instance.
export const apiKeyRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: (req: Request) => (req.apiKey?.mode === "LIVE" ? env.rateLimit.livePerMinute : env.rateLimit.testPerMinute),
  keyGenerator: (req: Request) => req.apiKey?.id ?? req.ip ?? "unknown",
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests." } });
  },
});
