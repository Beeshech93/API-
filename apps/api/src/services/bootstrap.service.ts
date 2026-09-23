import { Prisma } from "@prisma/client";
import { prisma } from "@/utils/prisma";
import { DEFAULT_FEE_CONFIG } from "@/services/fee.service";
import { DEFAULT_LIMITS } from "@/services/limits.service";
import { PROVIDER_CODES } from "@/services/provider.service";

// Idempotent: creates missing defaults but never overwrites values an
// administrator has since edited (fees, limits).
export async function ensureDefaults(): Promise<void> {
  for (const provider of PROVIDER_CODES) {
    await prisma.provider.upsert({ where: { code: provider.code }, create: { code: provider.code, name: provider.name }, update: {} });
  }
  await prisma.platformSetting.upsert({
    where: { key: "fees" },
    create: { key: "fees", value: DEFAULT_FEE_CONFIG as unknown as Prisma.InputJsonValue },
    update: {},
  });
  await prisma.platformSetting.upsert({
    where: { key: "limits" },
    create: { key: "limits", value: DEFAULT_LIMITS as unknown as Prisma.InputJsonValue },
    update: {},
  });
}
