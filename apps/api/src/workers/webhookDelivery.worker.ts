import { prisma } from "@/utils/prisma";
import { env } from "@/config/env";
import { buildSignatureHeader } from "@/utils/hmac";
import { safeRequest } from "@/utils/safeHttp";
import { decryptWebhookSecret, encryptWebhookSecret, isEncryptedWebhookSecret } from "@/utils/webhookSecret";

const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];
// `attempts` is the number of failed attempts after recording the current failure.
// The first failure must use the first backoff (60 seconds), not skip to 5 minutes.
const nextDelay = (attempts: number) => BACKOFF_MS[Math.min(Math.max(attempts - 1, 0), BACKOFF_MS.length - 1)];

async function fail(id: string, previousAttempts: number, responseStatus: number | null, responseBody: string) {
  const attempts = previousAttempts + 1;
  await prisma.webhookDelivery.update({ where: { id }, data: {
    status: attempts >= env.webhook.maxAttempts ? "EXHAUSTED" : "PENDING", attempts,
    responseStatus: responseStatus ?? undefined, responseBody: responseBody.slice(0, 1000),
    lastAttemptAt: new Date(), nextAttemptAt: new Date(Date.now() + nextDelay(attempts)),
  } });
}

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

  let signingSecret: string;
  try {
    signingSecret = decryptWebhookSecret(delivery.webhook.secret);
    // Migrate existing plaintext rows opportunistically; current delivery still uses the original value.
    if (!isEncryptedWebhookSecret(delivery.webhook.secret)) {
      await prisma.webhook.updateMany({
        where: { id: delivery.webhookId, secret: delivery.webhook.secret },
        data: { secret: encryptWebhookSecret(signingSecret) },
      });
    }
  } catch (error) {
    await fail(id, delivery.attempts, null, error instanceof Error ? error.message : "webhook secret unavailable");
    return;
  }

  const body = JSON.stringify(delivery.payload);
  try {
    const response = await safeRequest(delivery.webhook.url, {
      method: "POST", headers: {
        "Content-Type": "application/json",
        "X-HaitiPay-Signature": buildSignatureHeader(signingSecret, body),
        "X-HaitiPay-Event": delivery.event,
      }, body, timeoutMs: 8_000,
    });
    if (response.status >= 200 && response.status < 300) {
      await prisma.webhookDelivery.update({ where: { id }, data: {
        status: "SUCCEEDED", attempts: delivery.attempts + 1, responseStatus: response.status,
        responseBody: response.text.slice(0, 1000), lastAttemptAt: new Date(),
      } });
    } else await fail(id, delivery.attempts, response.status, response.text);
  } catch (error) {
    await fail(id, delivery.attempts, null, error instanceof Error ? error.message : "delivery error");
  }
}

export async function pollOnce(): Promise<{ processed: number }> {
  const due = await prisma.webhookDelivery.findMany({ where: { status: "PENDING", nextAttemptAt: { lte: new Date() } }, orderBy: { nextAttemptAt: "asc" }, take: 25 });
  for (let i = 0; i < due.length; i += 5) await Promise.allSettled(due.slice(i, i + 5).map((d) => deliverOne(d.id)));
  return { processed: due.length };
}

export function startWebhookDeliveryWorker(): NodeJS.Timeout {
  return setInterval(() => { pollOnce().catch((error) => console.error("webhook delivery tick failed", error)); }, env.webhook.pollMs);
}
