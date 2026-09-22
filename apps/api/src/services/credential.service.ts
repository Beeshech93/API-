import { PaymentProvider } from "@ayitipay/shared";
import { prisma } from "@/utils/prisma";
import { decryptCredentialPayload, encryptCredentialPayload } from "@/utils/credentialCrypto";
import { DecryptedCredentials } from "@/providers/provider.types";

interface RawCredentialInput {
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
  baseUrl?: string;
}

export async function upsertProviderCredential(
  applicationId: string,
  provider: PaymentProvider,
  input: RawCredentialInput
) {
  const { encryptedPayload, iv, authTag } = encryptCredentialPayload({
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    webhookSecret: input.webhookSecret,
  });

  return prisma.providerCredential.upsert({
    where: { applicationId_provider: { applicationId, provider } },
    create: {
      applicationId,
      provider,
      baseUrl: input.baseUrl,
      encryptedPayload,
      iv,
      authTag,
    },
    update: {
      baseUrl: input.baseUrl,
      encryptedPayload,
      iv,
      authTag,
      active: true,
    },
    select: { id: true, provider: true, baseUrl: true, active: true, createdAt: true, updatedAt: true },
  });
}

export async function listProviderCredentials(applicationId: string) {
  return prisma.providerCredential.findMany({
    where: { applicationId },
    select: { id: true, provider: true, baseUrl: true, active: true, createdAt: true, updatedAt: true },
  });
}

export async function deactivateProviderCredential(applicationId: string, provider: PaymentProvider) {
  await prisma.providerCredential.updateMany({
    where: { applicationId, provider },
    data: { active: false },
  });
}

// Returns null when no active credential is on file — callers use this to
// decide between the mock adapter (TEST keys, always safe) and rejecting
// LIVE requests with PROVIDER_NOT_CONFIGURED.
export async function getDecryptedCredentials(
  applicationId: string,
  provider: PaymentProvider
): Promise<DecryptedCredentials | null> {
  const record = await prisma.providerCredential.findUnique({
    where: { applicationId_provider: { applicationId, provider } },
  });
  if (!record || !record.active) return null;

  const payload = decryptCredentialPayload<RawCredentialInput>({
    encryptedPayload: record.encryptedPayload,
    iv: record.iv,
    authTag: record.authTag,
  });

  return {
    clientId: payload.clientId,
    clientSecret: payload.clientSecret,
    webhookSecret: payload.webhookSecret,
    baseUrl: record.baseUrl ?? undefined,
  };
}
