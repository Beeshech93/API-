import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/utils/prisma";
import { AppError } from "@/utils/errors";
import { assertPublicHttpUrl } from "@/utils/ssrf";
import { audit } from "@/services/audit.service";

export const WEBHOOK_EVENTS = [
  "payment.pending",
  "payment.processing",
  "payment.completed",
  "payment.failed",
  "transfer.pending",
  "transfer.completed",
  "transfer.failed",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const newSecret = () => `whsec_${crypto.randomBytes(24).toString("base64url")}`;

function serialize(w: { id: string; url: string; events: string[]; active: boolean; createdAt: Date }) {
  return { id: w.id, url: w.url, events: w.events, active: w.active, created_at: w.createdAt };
}

export async function listWebhooks(clientId: string) {
  return (await prisma.webhook.findMany({ where: { clientId }, orderBy: { createdAt: "desc" } })).map(serialize);
}

export async function createWebhook(clientId: string, actor: { userId: string; ip?: string }, input: { url: string; events?: WebhookEvent[] }) {
  await assertPublicHttpUrl(input.url);
  const secret = newSecret();
  const webhook = await prisma.webhook.create({
    data: { clientId, url: input.url, secret, events: input.events?.length ? input.events : [...WEBHOOK_EVENTS] },
  });
  await audit({ action: "webhook.created", actorUserId: actor.userId, clientId, targetType: "webhook", targetId: webhook.id, ip: actor.ip });
  // The signing secret is returned only here; afterwards it can only be rotated.
  return { ...serialize(webhook), secret };
}

export async function rotateWebhookSecret(clientId: string, id: string) {
  const webhook = await prisma.webhook.findFirst({ where: { id, clientId } });
  if (!webhook) throw new AppError("NOT_FOUND", "Webhook not found.");
  const secret = newSecret();
  await prisma.webhook.update({ where: { id }, data: { secret } });
  return { ...serialize(webhook), secret };
}

export async function deleteWebhook(clientId: string, id: string) {
  const webhook = await prisma.webhook.findFirst({ where: { id, clientId } });
  if (!webhook) throw new AppError("NOT_FOUND", "Webhook not found.");
  await prisma.webhook.update({ where: { id }, data: { active: false } });
}

export async function listDeliveries(clientId: string) {
  const rows = await prisma.webhookDelivery.findMany({
    where: { webhook: { clientId } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((d) => ({
    id: d.id, event: d.event, transaction_id: d.transactionId, status: d.status.toLowerCase(),
    attempts: d.attempts, response_status: d.responseStatus, created_at: d.createdAt, last_attempt_at: d.lastAttemptAt,
  }));
}

export async function redeliver(clientId: string, deliveryId: string) {
  const delivery = await prisma.webhookDelivery.findFirst({ where: { id: deliveryId, webhook: { clientId } } });
  if (!delivery) throw new AppError("NOT_FOUND", "Delivery not found.");
  await prisma.webhookDelivery.create({
    data: {
      webhookId: delivery.webhookId, transactionId: delivery.transactionId, event: delivery.event,
      payload: delivery.payload as Prisma.InputJsonValue,
    },
  });
}

// Queue one delivery per active webhook subscribed to the event. The HTTP call
// itself happens in the delivery worker.
export async function enqueueEvent(clientId: string, transactionId: string, event: WebhookEvent, data: Record<string, unknown>) {
  const webhooks = await prisma.webhook.findMany({ where: { clientId, active: true, events: { has: event } } });
  if (webhooks.length === 0) return;
  const payload = { event, ...data } as Prisma.InputJsonValue;
  await prisma.webhookDelivery.createMany({
    data: webhooks.map((w) => ({ webhookId: w.id, transactionId, event, payload })),
  });
}
