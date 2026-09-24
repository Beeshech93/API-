import { Funding, FundingMethod, FundingStatus, Prisma } from "@prisma/client";
import { env } from "@/config/env";
import { prisma } from "@/utils/prisma";
import { AppError } from "@/utils/errors";
import { newFundingId } from "@/utils/ids";
import { getProvider } from "@/providers/provider.factory";
import { audit } from "@/services/audit.service";
import { assertLiveAllowed, getLimits } from "@/services/limits.service";
import { logProviderCall } from "@/services/providerLog.service";

// Recharging a client's balance. It mirrors the ways the payment provider lets its
// own partners fund a wallet:
//   - MonCash: automatic. The payer completes a hosted MonCash payment and the
//     provider confirms it (webhook / status check) — never the browser.
//   - NatCash, Zelle, bank deposit/transfer, crypto (USDT): the client pays outside
//     the platform following instructions the administrator wrote, then submits
//     the proof; an administrator verifies it and approves or rejects.
// A completed funding adds to the client's available balance (HTG, LIVE only).

// SANDBOX credits (simulated, TEST only) are not a method clients or admins configure.
export type RealMethod = Exclude<FundingMethod, "SANDBOX">;
export const MANUAL_METHODS: RealMethod[] = ["NATCASH", "ZELLE", "BANK_DEPOSIT", "BANK_TRANSFER", "CRYPTO_USDT"];
export const ALL_METHODS: RealMethod[] = ["MONCASH", ...MANUAL_METHODS];
const MAX_AMOUNT = 10_000_000;
const MAX_PENDING = 10;

export interface MethodConfig {
  enabled: boolean;
  minAmount: number;
  // Shown to clients (account number, wallet address, Zelle email...). Manual methods only.
  instructions: string;
}
export type FundingConfig = Record<RealMethod, MethodConfig>;

export const DEFAULT_FUNDING_CONFIG: FundingConfig = {
  MONCASH: { enabled: true, minAmount: 100, instructions: "" },
  NATCASH: { enabled: false, minAmount: 100, instructions: "" },
  ZELLE: { enabled: false, minAmount: 100, instructions: "" },
  BANK_DEPOSIT: { enabled: false, minAmount: 100, instructions: "" },
  BANK_TRANSFER: { enabled: false, minAmount: 100, instructions: "" },
  CRYPTO_USDT: { enabled: false, minAmount: 100, instructions: "" },
};

const KEY = "funding_methods";

export async function getFundingConfig(): Promise<FundingConfig> {
  const row = await prisma.platformSetting.findUnique({ where: { key: KEY } });
  const stored = (row?.value as Partial<FundingConfig> | undefined) ?? {};
  const out = { ...DEFAULT_FUNDING_CONFIG } as FundingConfig;
  for (const m of ALL_METHODS) out[m] = { ...DEFAULT_FUNDING_CONFIG[m], ...(stored[m] ?? {}) };
  return out;
}

export async function saveFundingConfig(config: FundingConfig): Promise<FundingConfig> {
  await prisma.platformSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: config as unknown as Prisma.InputJsonValue },
    update: { value: config as unknown as Prisma.InputJsonValue },
  });
  return config;
}

// What a client sees: only enabled methods, with the instructions for manual ones.
export async function listMethods() {
  const config = await getFundingConfig();
  return ALL_METHODS.filter((m) => config[m].enabled).map((m) => ({
    method: m.toLowerCase(),
    automatic: m === "MONCASH",
    min_amount: config[m].minAmount,
    instructions: m === "MONCASH" ? "" : config[m].instructions,
  }));
}

export function serializeFunding(f: Funding) {
  return {
    id: f.id,
    method: f.method.toLowerCase(),
    amount: Number(f.amount),
    credited_amount: f.creditedAmount === null ? null : Number(f.creditedAmount),
    currency: f.currency,
    status: f.status.toLowerCase(),
    reference: f.reference,
    note: f.note,
    // Only while it can still be paid.
    payment_url: f.status === "PENDING" ? f.paymentUrl : null,
    review_note: f.reviewNote,
    created_at: f.createdAt.toISOString(),
    updated_at: f.updatedAt.toISOString(),
  };
}

export interface FundingInput {
  method: FundingMethod;
  amount: number;
  reference?: string;
  note?: string;
}

export async function createFunding(client: { id: string; liveEnabled: boolean; canSend: boolean }, input: FundingInput, requestId: string) {
  if (!client.canSend) throw new AppError("FORBIDDEN", "This account is not set up to send money, so there is nothing to recharge.");
  assertLiveAllowed(await getLimits(), client);
  if (input.method === "SANDBOX") throw new AppError("INVALID_REQUEST", "This funding method is not available.");
  const config = (await getFundingConfig())[input.method];
  if (!config.enabled) throw new AppError("INVALID_REQUEST", "This funding method is not available.");
  if (!Number.isFinite(input.amount) || input.amount < config.minAmount) {
    throw new AppError("INVALID_AMOUNT", `The minimum amount for this method is ${config.minAmount} HTG.`);
  }
  if (input.amount > MAX_AMOUNT) throw new AppError("INVALID_AMOUNT", `The maximum amount is ${MAX_AMOUNT} HTG.`);
  if ((await prisma.funding.count({ where: { clientId: client.id, environment: "LIVE", status: "PENDING" } })) >= MAX_PENDING) {
    throw new AppError("FORBIDDEN", "You have too many pending funding requests. Wait for them to be settled first.");
  }

  if (input.method === "MONCASH") return createMoncashFunding(client.id, input, requestId);

  const reference = input.reference?.trim() ?? "";
  if (reference.length < 4) throw new AppError("INVALID_REQUEST", "Enter the transaction ID or reference of your payment (at least 4 characters).");
  // The same proof can't be used to claim credit twice.
  const duplicate = await prisma.funding.findFirst({
    where: { method: input.method, reference: { equals: reference, mode: "insensitive" }, status: { in: ["PENDING", "COMPLETED"] } },
  });
  if (duplicate) throw new AppError("CONFLICT", "This reference has already been submitted.");

  const created = await prisma.funding.create({
    data: { id: newFundingId(), clientId: client.id, method: input.method, amount: input.amount, reference, note: input.note?.trim() || null, requestId },
  });
  await audit({ action: "funding.requested", clientId: client.id, targetType: "funding", targetId: created.id, metadata: { method: input.method, amount: input.amount } });
  return created;
}

async function createMoncashFunding(clientId: string, input: FundingInput, requestId: string) {
  const provider = getProvider("LIVE");
  const providerInput = { network: "MONCASH" as const, amount: input.amount, currency: "HTG" as const, phone: "", requestId };
  // Refuse before creating anything if the provider can't take it (not configured, over the limit...).
  await provider.validate?.("PAYMENT", providerInput);

  const created = await prisma.funding.create({
    data: { id: newFundingId(), clientId, method: "MONCASH", amount: input.amount, note: input.note?.trim() || null, requestId },
  });
  const started = Date.now();
  try {
    const result = await provider.createPayment({
      ...providerInput,
      transactionId: created.id,
      description: "Balance top-up",
      successUrl: `${env.portalAppUrl}/dashboard/funding?result=success`,
      errorUrl: `${env.portalAppUrl}/dashboard/funding?result=error`,
    });
    await logProviderCall({ providerCode: "moncash", operation: "createFunding", requestId, success: true, responseMs: Date.now() - started });
    return prisma.funding.update({ where: { id: created.id }, data: { providerTransactionId: result.providerTransactionId, paymentUrl: result.redirectUrl } });
  } catch (error) {
    // No payment page exists, so nobody can have paid: a clean failure.
    await prisma.funding.update({ where: { id: created.id }, data: { status: "FAILED", reviewNote: "The payment could not be created." } });
    throw error instanceof AppError ? error : new AppError("PROVIDER_ERROR", "The payment could not be created.");
  }
}

// Moves a funding out of PENDING exactly once (racing webhook/poll/admin can't both credit it).
async function settle(f: Funding, status: FundingStatus, data: { creditedAmount?: number; reviewedBy?: string; reviewNote?: string } = {}) {
  const { count } = await prisma.funding.updateMany({
    where: { id: f.id, status: "PENDING" },
    data: {
      status,
      ...(status === "COMPLETED" ? { creditedAmount: data.creditedAmount ?? Number(f.amount) } : {}),
      ...(data.reviewedBy ? { reviewedBy: data.reviewedBy, reviewedAt: new Date() } : {}),
      ...(data.reviewNote ? { reviewNote: data.reviewNote } : {}),
    },
  });
  const updated = (await prisma.funding.findUnique({ where: { id: f.id } })) ?? f;
  const won = count === 1;
  if (won) {
    await audit({ action: `funding.${status.toLowerCase()}`, actorUserId: data.reviewedBy, clientId: f.clientId, targetType: "funding", targetId: f.id, metadata: { method: f.method, amount: Number(f.amount), credited: data.creditedAmount ?? null } });
  }
  return { funding: updated, won };
}

// Asks the provider what happened to an automatic funding and applies it. Only the
// provider's answer (fetched by us, never a request body) can credit a balance.
export async function syncFunding(f: Funding): Promise<{ funding: Funding; reached: boolean }> {
  if (f.method !== "MONCASH" || f.status !== "PENDING" || !f.providerTransactionId) return { funding: f, reached: true };
  const started = Date.now();
  let result;
  try {
    result = await getProvider("LIVE").getPayment("MONCASH", f.providerTransactionId);
  } catch {
    return { funding: f, reached: false };
  }
  await logProviderCall({ providerCode: "moncash", operation: "getFunding", requestId: f.requestId, success: true, responseMs: Date.now() - started });
  if (result.amount !== undefined && Number(result.amount) !== Number(f.amount)) {
    await audit({ action: "provider.amount_mismatch", clientId: f.clientId, targetType: "funding", targetId: f.id, metadata: { expected: Number(f.amount), reported: result.amount } });
    return { funding: f, reached: true };
  }
  if (result.status === "COMPLETED") return { funding: (await settle(f, "COMPLETED", { creditedAmount: Number(f.amount) })).funding, reached: true };
  if (result.status === "FAILED" || result.status === "CANCELLED") return { funding: (await settle(f, "FAILED", { reviewNote: "The payment was not completed." })).funding, reached: true };
  return { funding: f, reached: true };
}

export async function reconcileFundings(limit = 25, olderThanMs = 60_000) {
  const rows = await prisma.funding.findMany({
    where: { method: "MONCASH", status: "PENDING", providerTransactionId: { not: null }, updatedAt: { lt: new Date(Date.now() - olderThanMs) } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let settled = 0;
  for (const f of rows) if ((await syncFunding(f)).funding.status !== f.status) settled++;
  return { checked: rows.length, settled };
}

export async function listClientFundings(clientId: string) {
  let rows = await prisma.funding.findMany({ where: { clientId, environment: "LIVE" }, orderBy: { createdAt: "desc" }, take: 50 });
  // Pending automatic fundings are re-checked with the provider when the client looks (max 5, 5s freshness).
  const stale = rows.filter((f) => f.method === "MONCASH" && f.status === "PENDING" && f.providerTransactionId && Date.now() - f.updatedAt.getTime() > 5_000).slice(0, 5);
  if (stale.length) {
    const synced = await Promise.all(stale.map((f) => syncFunding(f)));
    const byId = new Map(synced.map((s) => [s.funding.id, s.funding]));
    rows = rows.map((f) => byId.get(f.id) ?? f);
  }
  return rows;
}

export async function listAllFundings(status?: FundingStatus) {
  const rows = await prisma.funding.findMany({
    where: { environment: "LIVE", ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { client: { select: { name: true } } },
  });
  return rows.map((f) => ({ ...serializeFunding(f), client_id: f.clientId, client_name: f.client.name, requested_at: f.createdAt.toISOString() }));
}

async function loadManual(id: string) {
  const f = await prisma.funding.findUnique({ where: { id } });
  if (!f) throw new AppError("NOT_FOUND", "Funding request not found.");
  if (f.method === "MONCASH") throw new AppError("INVALID_REQUEST", "MonCash fundings are settled automatically by the provider.");
  if (f.status !== "PENDING") throw new AppError("CONFLICT", `This request is already ${f.status.toLowerCase()}.`);
  return f;
}

export async function approveFunding(id: string, actor: { userId: string }, input: { amount?: number; note?: string }) {
  const f = await loadManual(id);
  const credited = input.amount ?? Number(f.amount);
  if (!Number.isFinite(credited) || credited <= 0 || credited > MAX_AMOUNT) throw new AppError("INVALID_AMOUNT", "Invalid amount to credit.");
  return decided(await settle(f, "COMPLETED", { creditedAmount: credited, reviewedBy: actor.userId, reviewNote: input.note }));
}

export async function rejectFunding(id: string, actor: { userId: string }, note: string) {
  const f = await loadManual(id);
  return decided(await settle(f, "REJECTED", { reviewedBy: actor.userId, reviewNote: note }));
}

// Two administrators acting at once: only the first decision counts; the other is told.
function decided(result: { funding: Funding; won: boolean }) {
  if (!result.won) throw new AppError("CONFLICT", `This request is already ${result.funding.status.toLowerCase()}.`);
  return result.funding;
}

// Sandbox only: adds simulated money to a TEST balance so an account that only sends
// money (and so can't receive test payments) can still try transfers. Never real money.
export async function sandboxFund(clientId: string, amount: number, currency: "HTG" | "USD") {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) throw new AppError("INVALID_AMOUNT", "Amount must be between 1 and 1,000,000.");
  return prisma.funding.create({
    data: { id: newFundingId(), clientId, method: "SANDBOX", environment: "TEST", amount, creditedAmount: amount, currency, status: "COMPLETED", requestId: "sandbox" },
  });
}
