import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

// Provider credentials belong to the platform operator only. They are
// read here from the backend environment and never stored in the database,
// returned by any endpoint, or sent to a browser.
export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction,
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwt: {
    secret: required("JWT_SECRET", "dev-only-insecure-secret"),
    accessTtlSeconds: Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? 15 * 60),
    refreshTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30),
  },
  portalAppUrl: process.env.PORTAL_APP_URL ?? "http://localhost:3000",
  cronSecret: process.env.CRON_SECRET ?? "",
  // Public base URL of this API. LIVE transactions tell the provider to notify
  // `${apiPublicUrl}/webhooks/provider`; without it, results are polled instead.
  apiPublicUrl: (process.env.API_PUBLIC_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "")).replace(/\/+$/, ""),
  // 32-byte key (base64 or hex) that encrypts secrets stored in the database.
  secretsKey: process.env.CREDENTIALS_ENCRYPTION_KEY ?? "",
  // Display name is shown to administrators only; it lives here (not in code)
  // so the public repository stays provider-neutral.
  provider: {
    name: process.env.PROVIDER_NAME ?? "Payment provider",
    apiUrl: process.env.PROVIDER_API_URL ?? "",
    apiKey: process.env.PROVIDER_API_KEY ?? "",
    secretKey: process.env.PROVIDER_SECRET_KEY ?? "",
    webhookSecret: process.env.PROVIDER_WEBHOOK_SECRET ?? "",
  },
  webhook: {
    maxAttempts: Number(process.env.WEBHOOK_MAX_ATTEMPTS ?? 6),
    pollMs: Number(process.env.WEBHOOK_WORKER_POLL_MS ?? 10000),
  },
  testRateLimitPerMinute: Number(process.env.RATE_LIMIT_TEST_PER_MIN ?? 60),
  ipRateLimitPerMinute: Number(process.env.RATE_LIMIT_IP_PER_MIN ?? 600),
} as const;
