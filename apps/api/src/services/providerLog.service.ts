import { prisma } from "@/utils/prisma";

// Kept apart from provider.service so the live provider can log without importing
// the module that (indirectly) imports it.
export async function logProviderCall(entry: {
  providerCode: string; operation: string; requestId?: string; success: boolean; responseMs: number; errorCode?: string; errorMessage?: string;
}) {
  try {
    await prisma.providerLog.create({ data: entry });
  } catch {
    // never fail a payment because of a monitoring write
  }
}
