import { Prisma } from "@prisma/client";
import { Currency } from "@ayitipay/shared";
import { prisma } from "@/utils/prisma";

interface CreateLedgerEntryParams {
  applicationId: string;
  transactionId: string;
  amount: Prisma.Decimal | number;
  currency: Currency;
  feeBps: number;
}

// Idempotent by design: `LedgerEntry.transactionId` is unique, so re-settling
// the same transaction (e.g. a duplicate sandbox simulate call) never
// double-charges the platform commission — the unique-constraint violation
// is swallowed as a no-op.
export async function recordLedgerEntryOnce(params: CreateLedgerEntryParams): Promise<void> {
  const amount = new Prisma.Decimal(params.amount);
  const feeAmount = amount.mul(params.feeBps).div(10000).toDecimalPlaces(2);

  try {
    await prisma.ledgerEntry.create({
      data: {
        applicationId: params.applicationId,
        transactionId: params.transactionId,
        feeAmount,
        feeCurrency: params.currency,
        feeBps: params.feeBps,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return;
    }
    throw error;
  }
}

export async function listLedgerEntries(applicationId: string) {
  return prisma.ledgerEntry.findMany({
    where: { applicationId },
    orderBy: { createdAt: "desc" },
    include: { transaction: { select: { reference: true, provider: true } } },
  });
}
