import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwt: {
    secret: required("JWT_SECRET", "dev-only-insecure-secret"),
    expiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  },
  credentialsEncryptionKey: process.env.CREDENTIALS_ENCRYPTION_KEY ?? "",
  portalAppUrl: process.env.PORTAL_APP_URL ?? "http://localhost:3000",
  platformDefaultFeeBps: Number(process.env.PLATFORM_DEFAULT_FEE_BPS ?? 150),
  webhook: {
    maxAttempts: Number(process.env.WEBHOOK_MAX_ATTEMPTS ?? 6),
    pollMs: Number(process.env.WEBHOOK_WORKER_POLL_MS ?? 10000),
  },
  rateLimit: {
    testPerMinute: Number(process.env.RATE_LIMIT_TEST_PER_MIN ?? 60),
    livePerMinute: Number(process.env.RATE_LIMIT_LIVE_PER_MIN ?? 120),
  },
} as const;
