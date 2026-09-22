import { Router } from "express";
import { PaymentProvider } from "@ayitipay/shared";
import { asyncHandler } from "@/utils/asyncHandler";
import { requireDeveloperAuth } from "@/middleware/auth.jwt";
import { AppError } from "@/utils/errors";
import * as applicationService from "@/services/application.service";
import * as apiKeyService from "@/services/apikey.service";
import * as credentialService from "@/services/credential.service";
import * as webhookService from "@/services/webhook.service";
import * as ledgerService from "@/services/ledger.service";
import { prisma } from "@/utils/prisma";
import { toTransactionDto } from "@/services/payment.service";
import {
  createApplicationSchema,
  createWebhookEndpointSchema,
  issueApiKeySchema,
  upsertCredentialSchema,
} from "@/validators/portal.validators";

export const portalRouter = Router();
portalRouter.use(requireDeveloperAuth);

// -- Applications ------------------------------------------------------

portalRouter.get(
  "/applications",
  asyncHandler(async (req, res) => {
    const applications = await applicationService.listApplications(req.developer!.id);
    res.json(applications);
  })
);

portalRouter.post(
  "/applications",
  asyncHandler(async (req, res) => {
    const input = createApplicationSchema.parse(req.body);
    const application = await applicationService.createApplication(req.developer!.id, input.name);
    res.status(201).json(application);
  })
);

// Every /applications/:appId/* route below shares the same ownership check.
async function ownedApplication(applicationId: string, developerId: string) {
  return applicationService.requireApplicationOwnership(applicationId, developerId);
}

// -- API keys ------------------------------------------------------

portalRouter.get(
  "/applications/:appId/keys",
  asyncHandler(async (req, res) => {
    await ownedApplication(req.params.appId, req.developer!.id);
    res.json(await apiKeyService.listApiKeys(req.params.appId));
  })
);

portalRouter.post(
  "/applications/:appId/keys",
  asyncHandler(async (req, res) => {
    await ownedApplication(req.params.appId, req.developer!.id);
    const input = issueApiKeySchema.parse(req.body);
    const key = await apiKeyService.issueApiKey(req.params.appId, input.mode, input.label);
    res.status(201).json(key);
  })
);

portalRouter.delete(
  "/applications/:appId/keys/:keyId",
  asyncHandler(async (req, res) => {
    await ownedApplication(req.params.appId, req.developer!.id);
    await apiKeyService.revokeApiKey(req.params.appId, req.params.keyId);
    res.status(204).send();
  })
);

// -- Provider credentials ------------------------------------------------------

portalRouter.get(
  "/applications/:appId/credentials",
  asyncHandler(async (req, res) => {
    await ownedApplication(req.params.appId, req.developer!.id);
    res.json(await credentialService.listProviderCredentials(req.params.appId));
  })
);

portalRouter.put(
  "/applications/:appId/credentials",
  asyncHandler(async (req, res) => {
    await ownedApplication(req.params.appId, req.developer!.id);
    const input = upsertCredentialSchema.parse(req.body);
    const record = await credentialService.upsertProviderCredential(req.params.appId, input.provider, input);
    res.status(200).json(record);
  })
);

portalRouter.delete(
  "/applications/:appId/credentials/:provider",
  asyncHandler(async (req, res) => {
    await ownedApplication(req.params.appId, req.developer!.id);
    const provider = req.params.provider.toUpperCase() as PaymentProvider;
    await credentialService.deactivateProviderCredential(req.params.appId, provider);
    res.status(204).send();
  })
);

// -- Webhook endpoints + deliveries ------------------------------------------------------

portalRouter.get(
  "/applications/:appId/webhook-endpoints",
  asyncHandler(async (req, res) => {
    await ownedApplication(req.params.appId, req.developer!.id);
    res.json(await webhookService.listWebhookEndpoints(req.params.appId));
  })
);

portalRouter.post(
  "/applications/:appId/webhook-endpoints",
  asyncHandler(async (req, res) => {
    await ownedApplication(req.params.appId, req.developer!.id);
    const input = createWebhookEndpointSchema.parse(req.body);
    const endpoint = await webhookService.createWebhookEndpoint(req.params.appId, input.url);
    res.status(201).json(endpoint);
  })
);

portalRouter.delete(
  "/applications/:appId/webhook-endpoints/:id",
  asyncHandler(async (req, res) => {
    await ownedApplication(req.params.appId, req.developer!.id);
    await webhookService.deactivateWebhookEndpoint(req.params.appId, req.params.id);
    res.status(204).send();
  })
);

portalRouter.get(
  "/applications/:appId/webhook-deliveries",
  asyncHandler(async (req, res) => {
    await ownedApplication(req.params.appId, req.developer!.id);
    res.json(await webhookService.listWebhookDeliveries(req.params.appId));
  })
);

portalRouter.post(
  "/applications/:appId/webhook-deliveries/:id/redeliver",
  asyncHandler(async (req, res) => {
    await ownedApplication(req.params.appId, req.developer!.id);
    const delivery = await webhookService.redeliverWebhook(req.params.appId, req.params.id);
    res.status(201).json(delivery);
  })
);

// -- Transactions ------------------------------------------------------

portalRouter.get(
  "/applications/:appId/transactions",
  asyncHandler(async (req, res) => {
    await ownedApplication(req.params.appId, req.developer!.id);
    const transactions = await prisma.transaction.findMany({
      where: { applicationId: req.params.appId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json(transactions.map(toTransactionDto));
  })
);

portalRouter.get(
  "/applications/:appId/transactions/:id",
  asyncHandler(async (req, res) => {
    await ownedApplication(req.params.appId, req.developer!.id);
    const transaction = await prisma.transaction.findFirst({
      where: { id: req.params.id, applicationId: req.params.appId },
      include: { events: { orderBy: { createdAt: "desc" } } },
    });
    if (!transaction) throw AppError.notFound("Transaction not found.", "PAYMENT_NOT_FOUND");
    res.json({ ...toTransactionDto(transaction), events: transaction.events });
  })
);

// -- Billing ledger ------------------------------------------------------

portalRouter.get(
  "/applications/:appId/ledger",
  asyncHandler(async (req, res) => {
    await ownedApplication(req.params.appId, req.developer!.id);
    res.json(await ledgerService.listLedgerEntries(req.params.appId));
  })
);
