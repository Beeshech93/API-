import { prisma } from "@/utils/prisma";
import { env } from "@/config/env";
import { buildSignatureHeader } from "@/utils/hmac";
import { assertPublicHttpUrl } from "@/utils/ssrf";

const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];
const nextDelay = (attempts: number) => BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];

async function fail(id: string, previousAttempts: number, responseStatus: number | null, responseBody: string) {
  const attempts = previousAttempts + 1;
  await prisma.webhookDelivery.update({
    where: { id },
    data: {
      status: attempts >= env.webhook.maxAttempts ? "EXHAUSTED" : "PENDING",
      attempts,
      responseStatus: responseStatus ?? undefined,
      responseBody: responseBody.slice(0, 1000),
      lastAttemptAt: new Date(),
      nextAttemptAt: new Date(Date.now() + nextDelay(attempts)),
    },
  });
}

async function deliverOne(id: string) {
  const delivery = await prisma.webhookDelivery.findUnique({ where: { id }, include: { webhook: true } });
  if (!delivery || delivery.status !== "PENDING") return;

  const body = JSON.stringify(delivery.payload);
  try {
    await assertPublicHttpUrl(delivery.webhook.url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const response = await fetch(delivery.webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-HaitiPay-Signature": buildSignatureHeader(delivery.webhook.secret, body),
        "X-HaitiPay-Event": delivery.event,
      },
      body,
      redirect: "manual",
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    const text = await response.text().catch(() => "");

    if (response.ok) {
      await prisma.webhookDelivery.update({
        where: { id },
        data: { status: "SUCCEEDED", attempts: delivery.attempts + 1, responseStatus: response.status, responseBody: text.slice(0, 1000), lastAttemptAt: new Date() },
      });
    } else {
      await fail(id, delivery.attempts, response.status, text);
    }
  } catch (error) {
    await fail(id, delivery.attempts, null, error instanceof Error ? error.message : "delivery error");
  }
}

let polling = false;

// One pass over due deliveries. Runs inline right after a status change, from a
// daily cron (retry sweep) and, on a long-running host, from a timer.
export async function pollOnce(): Promise<{ processed: number }> {
  if (polling) return { processed: 0 };
  polling = true;
  try {
    const due = await prisma.webhookDelivery.findMany({ where: { status: "PENDING", nextAttemptAt: { lte: new Date() } }, take: 25 });
    for (const delivery of due) await deliverOne(delivery.id);
    return { processed: due.length };
  } finally {
    polling = false;
  }
}

export function startWebhookDeliveryWorker(): NodeJS.Timeout {
  return setInterval(() => {
    pollOnce().catch((error) => console.error("webhook delivery tick failed", error));
  }, env.webhook.pollMs);
}
