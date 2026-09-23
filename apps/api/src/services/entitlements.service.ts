import { Plan, Subscription } from "@prisma/client";
import { prisma } from "@/utils/prisma";
import { env } from "@/config/env";

export interface Entitlements {
  subscription: (Subscription & { plan: Plan }) | null;
  active: boolean;
  monthlyRequestLimit: number | null;
  rateLimitPerMinute: number;
  maxLiveKeys: number | null;
  transactionFeeBps: number | null;
}

const NO_PLAN_RATE_LIMIT = 30;
const MAX_TEST_KEYS = 3;
export { MAX_TEST_KEYS };

// What a client is currently allowed to do. A subscription only entitles LIVE
// access while it is ACTIVE or TRIAL and inside its paid period; an overdue one
// is flipped to EXPIRED lazily here instead of needing a scheduled job.
export async function getEntitlements(clientId: string): Promise<Entitlements> {
  let subscription = await prisma.subscription.findUnique({ where: { clientId }, include: { plan: true } });

  if (
    subscription &&
    (subscription.status === "ACTIVE" || subscription.status === "TRIAL" || subscription.status === "CANCELLED") &&
    subscription.currentPeriodEnd.getTime() < Date.now()
  ) {
    subscription = await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: "EXPIRED" },
      include: { plan: true },
    });
  }

  const active =
    !!subscription &&
    (subscription.status === "ACTIVE" || subscription.status === "TRIAL" || subscription.status === "CANCELLED") &&
    subscription.currentPeriodEnd.getTime() >= Date.now();

  if (!subscription) {
    return { subscription: null, active: false, monthlyRequestLimit: 0, rateLimitPerMinute: NO_PLAN_RATE_LIMIT, maxLiveKeys: 0, transactionFeeBps: null };
  }

  const plan = subscription.plan;
  return {
    subscription,
    active,
    monthlyRequestLimit: subscription.customRequestLimit ?? plan.monthlyRequestLimit,
    rateLimitPerMinute: subscription.customRateLimit ?? plan.rateLimitPerMinute ?? NO_PLAN_RATE_LIMIT,
    maxLiveKeys: plan.maxApiKeys,
    transactionFeeBps: plan.transactionFeeBps,
  };
}

export function trialEndsAt(from = new Date()): Date {
  return new Date(from.getTime() + env.trialDays * 24 * 60 * 60 * 1000);
}
