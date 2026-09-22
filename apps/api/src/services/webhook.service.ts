import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/utils/prisma";
import { AppError } from "@/utils/errors";
import { TransactionDto } from "@ayitipay/shared";

export async function createWebhookEndpoint(applicationId: string, url: string) {
  const secret = `whsec_${crypto.randomBytes(24).toString("base64url")}`;
  return prisma.webhookEndpoint.create({ data: { applicationId, url, secret } });
}

export async function listWebhookEndpoints(applicationId: string) {
  return prisma.webhookEndpoint.findMany({ where: { applicationId }, orderBy: { createdAt: "desc" } });
}

export async function deactivateWebhookEndpoint(applicationId: string, id: string) {
  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, applicationId } });
  if (!endpoint) throw AppError.notFound("Webhook endpoint not found.", "WEBHOOK_ENDPOINT_NOT_FOUND");
  await prisma.webhookEndpoint.update({ where: { id }, data: { active: false } });
}

const EVENT_TYPE_BY_STATUS: Record<string, string> = {
  SUCCEEDED: "payment.succeeded",
  FAILED: "payment.failed",
  CANCELLED: "payment.cancelled",
  REFUNDED: "payment.refunded",
};

// Fans a terminal transaction status out to every active webhook endpoint on
// the owning application as a queued (PENDING) delivery — the actual HTTP
// call happens asynchronously in the delivery worker, not here.
export async function enqueueWebhookDeliveries(applicationId: string, transactionId: string, transaction: TransactionDto) {
  const eventType = EVENT_TYPE_BY_STATUS[transaction.status];
  if (!eventType) return;

  const endpoints = await prisma.webhookEndpoint.findMany({ where: { applicationId, active: true } });
  if (endpoints.length === 0) return;

  const payload = {
    id: crypto.randomUUID(),
    type: eventType,
    createdAt: new Date().toISOString(),
    data: { transaction },
  } as unknown as Prisma.InputJsonValue;

  await prisma.webhookDelivery.createMany({
    data: endpoints.map((endpoint) => ({
      webhookEndpointId: endpoint.id,
      transactionId,
      eventType,
      payload,
    })),
  });
}

export async function listWebhookDeliveries(applicationId: string) {
  return prisma.webhookDelivery.findMany({
    where: { webhookEndpoint: { applicationId } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function redeliverWebhook(applicationId: string, deliveryId: string) {
  const delivery = await prisma.webhookDelivery.findFirst({
    where: { id: deliveryId, webhookEndpoint: { applicationId } },
  });
  if (!delivery) throw AppError.notFound("Webhook delivery not found.", "WEBHOOK_DELIVERY_NOT_FOUND");

  return prisma.webhookDelivery.create({
    data: {
      webhookEndpointId: delivery.webhookEndpointId,
      transactionId: delivery.transactionId,
      eventType: delivery.eventType,
      payload: delivery.payload as object,
    },
  });
}
