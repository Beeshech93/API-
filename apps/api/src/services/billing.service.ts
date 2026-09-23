import { prisma } from "@/utils/prisma";
import { AppError } from "@/utils/errors";
import { trialEndsAt, getEntitlements } from "@/services/entitlements.service";
import { getUsage } from "@/services/usage.service";
import { audit } from "@/services/audit.service";

// Payment collection is deliberately not built in: HaitiPay never touches card
// data. A real processor (e.g. Stripe Checkout + webhooks) plugs in behind this
// interface; until then subscriptions start as a TRIAL and an administrator
// activates them once payment is confirmed out of band.
export interface BillingProvider {
  readonly name: string;
}
export const manualBilling: BillingProvider = { name: "manual" };

const DAY = 24 * 60 * 60 * 1000;

export async function listPublicPlans() {
  const plans = await prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  return plans.map(serializePlan);
}

export function serializePlan(plan: {
  id: string; code: string; name: string; priceCents: number | null; currency: string;
  monthlyRequestLimit: number | null; maxApiKeys: number | null; rateLimitPerMinute: number | null;
  transactionFeeBps: number | null; features: unknown; active: boolean;
}) {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    price: plan.priceCents === null ? null : plan.priceCents / 100,
    currency: plan.currency,
    monthly_request_limit: plan.monthlyRequestLimit,
    max_api_keys: plan.maxApiKeys,
    rate_limit_per_minute: plan.rateLimitPerMinute,
    transaction_fee_bps: plan.transactionFeeBps,
    features: plan.features,
    active: plan.active,
  };
}

export async function getBillingOverview(clientId: string) {
  const entitlements = await getEntitlements(clientId);
  const usage = await getUsage(clientId);
  const invoices = await prisma.invoice.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 24 });
  const sub = entitlements.subscription;
  return {
    plan: sub ? serializePlan(sub.plan) : null,
    subscription: sub && {
      status: sub.status.toLowerCase(),
      start: sub.startedAt,
      end: sub.currentPeriodEnd,
      cancelled_at: sub.cancelledAt,
      monthly_request_limit: entitlements.monthlyRequestLimit,
      monthly_requests_used: usage.requests,
    },
    live_access: entitlements.active,
    usage,
    invoices: invoices.map((i) => ({
      id: i.id, amount: i.amountCents / 100, currency: i.currency, status: i.status.toLowerCase(),
      period_start: i.periodStart, period_end: i.periodEnd, paid_at: i.paidAt, created_at: i.createdAt,
    })),
  };
}

export async function selectPlan(clientId: string, planCode: string, actor: { userId: string; ip?: string }) {
  const plan = await prisma.plan.findFirst({ where: { code: planCode.toUpperCase(), active: true } });
  if (!plan) throw new AppError("NOT_FOUND", "Plan not found.");
  if (plan.priceCents === null) {
    throw new AppError("FORBIDDEN", "This plan is arranged by contract. Please contact sales.");
  }

  const existing = await prisma.subscription.findUnique({ where: { clientId } });
  const now = new Date();
  let subscription;
  if (!existing) {
    subscription = await prisma.subscription.create({
      data: { clientId, planId: plan.id, status: "TRIAL", startedAt: now, currentPeriodEnd: trialEndsAt(now) },
    });
  } else {
    // Plan changes apply immediately; the subscription status/period are kept,
    // and a cancelled or expired one is reopened as a trial.
    const reopen = existing.status === "CANCELLED" || existing.status === "EXPIRED";
    subscription = await prisma.subscription.update({
      where: { id: existing.id },
      data: {
        planId: plan.id,
        cancelledAt: null,
        ...(reopen ? { status: "TRIAL", startedAt: now, currentPeriodEnd: trialEndsAt(now) } : {}),
      },
    });
  }
  await audit({ action: "subscription.plan_selected", actorUserId: actor.userId, clientId, targetType: "plan", targetId: plan.id, ip: actor.ip });
  return subscription;
}

export async function cancelSubscription(clientId: string, actor: { userId: string; ip?: string }) {
  const sub = await prisma.subscription.findUnique({ where: { clientId } });
  if (!sub) throw new AppError("NOT_FOUND", "No subscription to cancel.");
  await prisma.subscription.update({ where: { id: sub.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  await audit({ action: "subscription.cancelled", actorUserId: actor.userId, clientId, ip: actor.ip });
}

// Administrator confirms payment: activates (or renews) the subscription for a
// month and records a paid invoice.
export async function activateSubscription(clientId: string, actorUserId: string) {
  const sub = await prisma.subscription.findUnique({ where: { clientId }, include: { plan: true } });
  if (!sub) throw new AppError("NOT_FOUND", "Client has no subscription.");
  const now = new Date();
  const base = sub.currentPeriodEnd.getTime() > now.getTime() && sub.status === "ACTIVE" ? sub.currentPeriodEnd : now;
  const end = new Date(base.getTime() + 30 * DAY);
  const updated = await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: "ACTIVE", currentPeriodEnd: end, cancelledAt: null },
  });
  await prisma.invoice.create({
    data: {
      clientId, subscriptionId: sub.id, amountCents: sub.plan.priceCents ?? 0, currency: sub.plan.currency,
      status: "PAID", periodStart: base, periodEnd: end, paidAt: now,
    },
  });
  await audit({ action: "subscription.activated", actorUserId, clientId, targetType: "subscription", targetId: sub.id });
  return updated;
}
