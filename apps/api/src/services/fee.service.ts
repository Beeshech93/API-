import { Prisma } from "@prisma/client";
import { prisma } from "@/utils/prisma";
import { AppError } from "@/utils/errors";
import { round2, toDecimal } from "@/utils/money";

export interface FeeConfig {
  percentageBps: number;
  fixedFee: { HTG: number; USD: number };
  providerFeeBps: number;
  minAmount: { HTG: number; USD: number };
  maxAmount: { HTG: number; USD: number };
}

export const DEFAULT_FEE_CONFIG: FeeConfig = {
  percentageBps: 100,
  fixedFee: { HTG: 0, USD: 0 },
  providerFeeBps: 0,
  minAmount: { HTG: 10, USD: 1 },
  maxAmount: { HTG: 1_000_000, USD: 10_000 },
};

export async function getFeeConfig(): Promise<FeeConfig> {
  const row = await prisma.platformSetting.findUnique({ where: { key: "fees" } });
  return { ...DEFAULT_FEE_CONFIG, ...((row?.value as Partial<FeeConfig> | undefined) ?? {}) };
}

export async function saveFeeConfig(config: FeeConfig): Promise<FeeConfig> {
  await prisma.platformSetting.upsert({
    where: { key: "fees" },
    create: { key: "fees", value: config as unknown as Prisma.InputJsonValue },
    update: { value: config as unknown as Prisma.InputJsonValue },
  });
  return config;
}

export interface Quote {
  amount: number;
  fee: number;
  total: number;
  currency: "HTG" | "USD";
}

export function assertAmountInRange(amount: number, currency: "HTG" | "USD", config: FeeConfig): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError("INVALID_AMOUNT", "Amount must be a positive number.");
  }
  if (amount < config.minAmount[currency] || amount > config.maxAmount[currency]) {
    throw new AppError(
      "INVALID_AMOUNT",
      `Amount must be between ${config.minAmount[currency]} and ${config.maxAmount[currency]} ${currency}.`
    );
  }
}

// fee = amount * (platform % [+ provider %]) + fixed fee. Computed before any
// operation runs and stored on the transaction so the client is charged exactly
// what the quote said.
export function computeQuote(amount: number, currency: "HTG" | "USD", config: FeeConfig): Quote {
  const bps = config.percentageBps + config.providerFeeBps;
  const gross = toDecimal(amount);
  const fee = round2(gross.mul(bps).div(10000).plus(config.fixedFee[currency]));
  return { amount, fee: fee.toNumber(), total: round2(gross.plus(fee)).toNumber(), currency };
}
