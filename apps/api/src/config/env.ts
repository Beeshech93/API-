import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

// Provider (Bazik) credentials belong to the platform operator only. They are
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
  trialDays: Number(process.env.TRIAL_DAYS ?? 14),
  bazik: {
    apiUrl: process.env.BAZIK_API_URL ?? "",
    apiKey: process.env.BAZIK_API_KEY ?? "",
    secretKey: process.env.BAZIK_SECRET_KEY ?? "",
    webhookSecret: process.env.BAZIK_WEBHOOK_SECRET ?? "",
  },
  webhook: {
    maxAttempts: Number(process.env.WEBHOOK_MAX_ATTEMPTS ?? 6),
    pollMs: Number(process.env.WEBHOOK_WORKER_POLL_MS ?? 10000),
  },
  testRateLimitPerMinute: Number(process.env.RATE_LIMIT_TEST_PER_MIN ?? 60),
  ipRateLimitPerMinute: Number(process.env.RATE_LIMIT_IP_PER_MIN ?? 600),
} as const;

export function isBazikConfigured(): boolean {
  return Boolean(env.bazik.apiUrl && env.bazik.apiKey && env.bazik.secretKey);
}
