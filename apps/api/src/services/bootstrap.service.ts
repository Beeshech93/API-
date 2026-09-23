import { Prisma } from "@prisma/client";
import { prisma } from "@/utils/prisma";
import { DEFAULT_FEE_CONFIG } from "@/services/fee.service";
import { PROVIDER_CODES } from "@/services/provider.service";

const PLANS = [
  { code: "STARTER", name: "Starter", priceCents: 2900, monthlyRequestLimit: 1000, maxApiKeys: 1, rateLimitPerMinute: 100, sortOrder: 1,
    features: ["api_moncash", "api_natcash", "dashboard_basic", "support_standard"] },
  { code: "BUSINESS", name: "Business", priceCents: 7900, monthlyRequestLimit: 10000, maxApiKeys: 5, rateLimitPerMinute: 500, sortOrder: 2,
    features: ["api_moncash", "api_natcash", "webhooks", "logs_advanced", "statistics", "support_priority"] },
  { code: "PRO", name: "Pro", priceCents: 19900, monthlyRequestLimit: 50000, maxApiKeys: 20, rateLimitPerMinute: 2000, sortOrder: 3,
    features: ["api_moncash", "api_natcash", "webhooks", "high_capacity", "rate_limits_higher", "dashboard_advanced", "support_priority"] },
  { code: "ENTERPRISE", name: "Enterprise", priceCents: null, monthlyRequestLimit: null, maxApiKeys: null, rateLimitPerMinute: 5000, sortOrder: 4,
    features: ["custom_limits", "custom_volume", "webhooks_advanced", "sla", "support_dedicated"] },
] as const;

// Idempotent: creates missing defaults but never overwrites values an
// administrator has since edited (prices, limits, fees).
export async function ensureDefaults(): Promise<void> {
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      create: { ...plan, features: plan.features as unknown as Prisma.InputJsonValue },
      update: {},
    });
  }
  for (const provider of PROVIDER_CODES) {
    await prisma.provider.upsert({ where: { code: provider.code }, create: { code: provider.code, name: provider.name }, update: {} });
  }
  await prisma.platformSetting.upsert({
    where: { key: "fees" },
    create: { key: "fees", value: DEFAULT_FEE_CONFIG as unknown as Prisma.InputJsonValue },
    update: {},
  });
}
