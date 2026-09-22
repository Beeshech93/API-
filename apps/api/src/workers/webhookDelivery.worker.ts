import { prisma } from "@/utils/prisma";
import { env } from "@/config/env";
import { buildSignedWebhookHeader } from "@/utils/hmac";

const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];

function nextAttemptDelay(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
}

async function deliverOne(deliveryId: string) {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhookEndpoint: true },
  });
  if (!delivery || delivery.status !== "PENDING") return;

  const body = JSON.stringify(delivery.payload);
  const signature = buildSignedWebhookHeader(delivery.webhookEndpoint.secret, body);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(delivery.webhookEndpoint.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Webhook-Signature": signature },
      body,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const responseBody = await response.text().catch(() => "");

    if (response.ok) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "SUCCEEDED",
          attempts: delivery.attempts + 1,
          responseStatus: response.status,
          responseBody: responseBody.slice(0, 2000),
          lastAttemptAt: new Date(),
        },
      });
      return;
    }

    await failDelivery(delivery.id, delivery.attempts, response.status, responseBody);
  } catch (error) {
    await failDelivery(delivery.id, delivery.attempts, null, error instanceof Error ? error.message : "unknown error");
  }
}

async function failDelivery(id: string, previousAttempts: number, responseStatus: number | null, responseBody: string) {
  const attempts = previousAttempts + 1;
  const exhausted = attempts >= env.webhook.maxAttempts;

  await prisma.webhookDelivery.update({
    where: { id },
    data: {
      status: exhausted ? "EXHAUSTED" : "PENDING",
      attempts,
      responseStatus: responseStatus ?? undefined,
      responseBody: responseBody.slice(0, 2000),
      lastAttemptAt: new Date(),
      nextAttemptAt: new Date(Date.now() + nextAttemptDelay(attempts)),
    },
  });
}

let polling = false;

async function pollOnce() {
  if (polling) return;
  polling = true;
  try {
    const due = await prisma.webhookDelivery.findMany({
      where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
      take: 25,
    });
    for (const delivery of due) {
      await deliverOne(delivery.id);
    }
  } finally {
    polling = false;
  }
}

export function startWebhookDeliveryWorker(): NodeJS.Timeout {
  return setInterval(() => {
    pollOnce().catch((error) => {
      // eslint-disable-next-line no-console
      console.error("webhook delivery worker tick failed", error);
    });
  }, env.webhook.pollMs);
}
