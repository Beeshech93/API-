import { prisma } from "@/utils/prisma";
import { env } from "@/config/env";
import { buildSignatureHeader } from "@/utils/hmac";
import { safeRequest } from "@/utils/safeHttp";

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

// A delivery is claimed before it is sent: the row is pushed into the future in one atomic update,
// and only the caller whose update changed the row sends it. Two instances running at the same
// moment (every request can trigger a pass) therefore never deliver the same event twice.
const CLAIM_LEASE_MS = 2 * 60_000;

async function claim(id: string): Promise<boolean> {
  const { count } = await prisma.webhookDelivery.updateMany({
    where: { id, status: "PENDING", nextAttemptAt: { lte: new Date() } },
    data: { nextAttemptAt: new Date(Date.now() + CLAIM_LEASE_MS) },
  });
  return count === 1;
}

async function deliverOne(id: string) {
  if (!(await claim(id))) return;
  const delivery = await prisma.webhookDelivery.findUnique({ where: { id }, include: { webhook: true } });
  if (!delivery || delivery.status !== "PENDING") return;

  const body = JSON.stringify(delivery.payload);
  try {
    const response = await safeRequest(delivery.webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-HaitiPay-Signature": buildSignatureHeader(delivery.webhook.secret, body),
        "X-HaitiPay-Event": delivery.event,
      },
      body,
      timeoutMs: 8_000,
    });

    if (response.status >= 200 && response.status < 300) {
      await prisma.webhookDelivery.update({
        where: { id },
        data: { status: "SUCCEEDED", attempts: delivery.attempts + 1, responseStatus: response.status, responseBody: response.text.slice(0, 1000), lastAttemptAt: new Date() },
      });
    } else {
      await fail(id, delivery.attempts, response.status, response.text);
    }
  } catch (error) {
    await fail(id, delivery.attempts, null, error instanceof Error ? error.message : "delivery error");
  }
}

// One pass over due deliveries. Runs in the background right after a status change, from a daily
// cron (retry sweep) and, on a long-running host, from a timer. Passes may overlap freely — every
// delivery is claimed atomically first — so a slow endpoint in one pass never leaves the events
// created meanwhile waiting for the next scheduled sweep.
export async function pollOnce(): Promise<{ processed: number }> {
  const due = await prisma.webhookDelivery.findMany({ where: { status: "PENDING", nextAttemptAt: { lte: new Date() } }, orderBy: { nextAttemptAt: "asc" }, take: 25 });
  // A few at a time, so one slow endpoint doesn't hold up the others.
  for (let i = 0; i < due.length; i += 5) {
    await Promise.allSettled(due.slice(i, i + 5).map((d) => deliverOne(d.id)));
  }
  return { processed: due.length };
}

export function startWebhookDeliveryWorker(): NodeJS.Timeout {
  return setInterval(() => {
    pollOnce().catch((error) => console.error("webhook delivery tick failed", error));
  }, env.webhook.pollMs);
}
