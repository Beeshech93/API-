import crypto from "crypto";
import { env } from "@/config/env";
import { CredentialRole, EffectiveConfig, getEffectiveConfig } from "@/services/providerConfig.service";
import { logProviderCall } from "@/services/providerLog.service";
import { AppError } from "@/utils/errors";
import {
  CreateProviderPaymentInput,
  NetworkCode,
  PaymentProviderClient,
  ProviderBalance,
  ProviderHealth,
  ProviderOperation,
  ProviderPayment,
  ProviderPrecheckInput,
  ProviderTxStatus,
} from "@/providers/provider.types";

// LIVE integration with the payment integrator, implemented from its official
// public API documentation:
//
//   POST /token                         userID + secretKey  -> bearer token (cached)
//   POST /moncash/token                 create a MonCash payment -> orderId + redirectUrl
//   GET  /order/{orderId}               payment status
//   POST /{moncash|natcash}/transfers   send money out -> TRF_… id
//   GET  /transfers/{id}                transfer status
//   GET  /balance                       operator wallet balance
//
// The connection (URL, user id, secret key, webhook secret) is entered by an
// administrator and read from the encrypted store on every call; nothing is
// ever logged, returned to a client or sent to a browser. Messages thrown from
// here can reach API clients, so they never name the provider — details go only
// to the admin-only provider log.
//
// Payments are receive-only on MonCash (the payer completes them on a hosted
// page); transfers work on both networks. The environment (sandbox / live) is
// decided by the credentials the administrator saved.

const TIMEOUT_MS = 15_000; // token + call + one re-auth stays inside the 60 s function limit
const TOKEN_MARGIN_MS = 60_000;
const MAX_TOKEN_LIFETIME_MS = 55 * 60_000; // the docs disagree (1h vs 24h): never trust more than an hour
const MAX_PAYMENT_HTG = 75_000;

interface HttpResult {
  status: number;
  json: Record<string, unknown>;
}

class NetworkFailure extends Error {
  constructor(readonly timedOut: boolean) {
    super(timedOut ? "timeout" : "network");
  }
}

let tokenCache: { fingerprint: string; token: string; expiresAt: number } | null = null;

const configFingerprint = (cfg: EffectiveConfig) =>
  crypto.createHash("sha256").update(`${cfg.apiUrl}\n${cfg.apiKey}\n${cfg.secretKey}`).digest("hex");

export function mapProviderStatus(raw: unknown): ProviderTxStatus {
  switch (String(raw ?? "").toLowerCase()) {
    case "successful":
    case "succeeded":
    case "success":
    case "completed":
      return "COMPLETED";
    case "failed":
    case "failure":
    case "error":
    case "rejected":
    case "declined":
      return "FAILED";
    case "cancelled":
    case "canceled":
      return "CANCELLED";
    case "processing":
      return "PROCESSING";
    default:
      // Unknown or "pending": never assume money moved.
      return "PENDING";
  }
}

// Recipient wallets are 8 digits; clients send 509XXXXXXXX.
export function toWallet(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("509") ? digits.slice(3) : digits;
}

const isTransferId = (id: string) => id.startsWith("TRF_");

async function http(cfg: EffectiveConfig, method: "GET" | "POST", path: string, opts: { token?: string; body?: unknown } = {}): Promise<HttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.apiUrl.replace(/\/+$/, "")}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
      // Never follow a redirect with a bearer token attached.
      redirect: "error",
    });
    let json: Record<string, unknown> = {};
    try {
      const parsed = await res.json();
      if (parsed && typeof parsed === "object") json = parsed as Record<string, unknown>;
    } catch {
      // non-JSON body
    }
    return { status: res.status, json };
  } catch (error) {
    throw new NetworkFailure(error instanceof Error && error.name === "AbortError");
  } finally {
    clearTimeout(timer);
  }
}

// Admin-only diagnostics: what the provider said, never a credential.
async function noteFailure(operation: string, requestId: string | undefined, started: number, detail: string) {
  await logProviderCall({ providerCode: "primary", operation, requestId, success: false, responseMs: Date.now() - started, errorCode: "PROVIDER_ERROR", errorMessage: detail.slice(0, 300) });
}

function describe(res: HttpResult): string {
  const err = res.json.error;
  const msg = typeof err === "string" ? err : typeof (err as { message?: unknown } | undefined)?.message === "string" ? (err as { message: string }).message : "";
  const extra = typeof res.json.message === "string" ? res.json.message : "";
  return `HTTP ${res.status}${msg ? ` ${msg}` : ""}${extra && extra !== msg ? ` — ${extra}` : ""}`;
}

// Receiving payments and sending money can use different provider accounts.
async function requireConfig(role: CredentialRole): Promise<EffectiveConfig> {
  const cfg = await getEffectiveConfig(role);
  if (!cfg.configured) {
    throw new AppError("PROVIDER_ERROR", role === "send" ? "Sending money is not configured on this platform yet." : "Receiving payments is not configured on this platform yet.");
  }
  return cfg;
}

async function getToken(cfg: EffectiveConfig, force = false): Promise<string> {
  const fingerprint = configFingerprint(cfg);
  if (!force && tokenCache && tokenCache.fingerprint === fingerprint && tokenCache.expiresAt - TOKEN_MARGIN_MS > Date.now()) return tokenCache.token;

  const started = Date.now();
  let res: HttpResult;
  try {
    res = await http(cfg, "POST", "/token", { body: { userID: cfg.apiKey, secretKey: cfg.secretKey } });
  } catch (error) {
    await noteFailure("authenticate", undefined, started, error instanceof NetworkFailure && error.timedOut ? "timeout" : "network error");
    throw new AppError("PROVIDER_ERROR", "Live payment processing is temporarily unavailable.");
  }
  const token = (res.json.token ?? res.json.access_token) as unknown;
  if (res.status < 200 || res.status >= 300 || typeof token !== "string" || !token) {
    tokenCache = null;
    await noteFailure("authenticate", undefined, started, `authentication rejected: ${describe(res)}`);
    throw new AppError("PROVIDER_ERROR", "Live payment processing is temporarily unavailable.");
  }
  let lifetime = MAX_TOKEN_LIFETIME_MS;
  if (typeof res.json.expires_at === "number") lifetime = Math.min(lifetime, res.json.expires_at - Date.now());
  else if (typeof res.json.expires_in === "number") lifetime = Math.min(lifetime, res.json.expires_in * 1000);
  tokenCache = { fingerprint, token, expiresAt: Date.now() + Math.max(lifetime, 0) };
  return token;
}

// Authenticated call. A 401 means "not processed", so it is safe to fetch a new
// token and retry once. `unknownOnFailure` marks calls where a lost response
// leaves the real outcome unknown (money may have moved).
async function call(
  cfg: EffectiveConfig,
  operation: string,
  requestId: string | undefined,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  unknownOnFailure = false
): Promise<HttpResult> {
  const started = Date.now();
  let token = await getToken(cfg);
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: HttpResult;
    try {
      res = await http(cfg, method, path, { token, body });
    } catch (error) {
      const timedOut = error instanceof NetworkFailure && error.timedOut;
      await noteFailure(operation, requestId, started, timedOut ? "timeout" : "network error");
      if (unknownOnFailure) throw new AppError("PROVIDER_TIMEOUT", "The provider did not confirm the operation in time.");
      throw new AppError(timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_ERROR", timedOut ? "The provider did not respond in time." : "Live payment processing is temporarily unavailable.");
    }
    if (res.status === 401 && attempt === 0) {
      token = await getToken(cfg, true);
      continue;
    }
    return res;
  }
  throw new AppError("PROVIDER_ERROR", "Live payment processing is temporarily unavailable.");
}

function webhookUrl(): string | undefined {
  return env.apiPublicUrl.startsWith("https://") ? `${env.apiPublicUrl}/webhooks/provider` : undefined;
}

export class LiveProvider implements PaymentProviderClient {
  async validate(type: ProviderOperation, input: ProviderPrecheckInput): Promise<void> {
    await requireConfig(type === "PAYMENT" ? "receive" : "send");
    if (input.currency !== "HTG") throw new AppError("INVALID_REQUEST", "LIVE transactions support HTG only.");
    if (type === "PAYMENT") {
      if (input.network !== "MONCASH") throw new AppError("INVALID_REQUEST", "Receiving payments is not available on this network yet.");
      if (input.amount > MAX_PAYMENT_HTG) {
        throw new AppError("INVALID_AMOUNT", `The maximum amount per payment is ${MAX_PAYMENT_HTG} HTG.`);
      }
    } else {
      if (!input.recipient?.firstName || !input.recipient?.lastName) {
        throw new AppError("INVALID_REQUEST", "recipient.first_name and recipient.last_name are required for LIVE transfers.");
      }
      if (!/^\d{8}$/.test(toWallet(input.phone))) throw new AppError("INVALID_PHONE", "The recipient number is not valid.");
    }
  }

  async createPayment(input: CreateProviderPaymentInput): Promise<ProviderPayment> {
    const cfg = await requireConfig("receive");
    if (input.network !== "MONCASH") throw new AppError("INVALID_REQUEST", "Receiving payments is not available on this network yet.");
    const started = Date.now();
    const hook = webhookUrl();
    const res = await call(cfg, "createPayment", input.requestId, "POST", "/moncash/token", {
      gdes: input.amount,
      userID: cfg.apiKey,
      referenceId: input.transactionId,
      ...(input.description ? { description: input.description } : {}),
      ...(input.successUrl ? { successUrl: input.successUrl } : {}),
      ...(input.errorUrl ? { errorUrl: input.errorUrl } : {}),
      ...(hook ? { webhookUrl: hook } : {}),
      metadata: { transactionId: input.transactionId, ...(hook ? { webhookUrl: hook } : {}) },
    });
    const orderId = res.json.orderId;
    if (res.status < 200 || res.status >= 300 || typeof orderId !== "string" || !orderId) {
      await noteFailure("createPayment", input.requestId, started, `create payment rejected: ${describe(res)}`);
      // No hosted page came back, so the payer can never be charged: a clean failure.
      throw new AppError("PROVIDER_ERROR", "The payment could not be created.");
    }
    const redirectUrl = typeof res.json.redirectUrl === "string" ? res.json.redirectUrl : undefined;
    return { providerTransactionId: orderId, status: mapProviderStatus(res.json.status), redirectUrl };
  }

  async createTransfer(input: CreateProviderPaymentInput): Promise<ProviderPayment> {
    const cfg = await requireConfig("send");
    if (!input.recipient) throw new AppError("INVALID_REQUEST", "recipient.first_name and recipient.last_name are required for LIVE transfers.");
    const started = Date.now();
    const network = input.network === "NATCASH" ? "natcash" : "moncash";
    const hook = webhookUrl();
    const res = await call(
      cfg,
      "createTransfer",
      input.requestId,
      "POST",
      `/${network}/transfers`,
      {
        gdes: input.amount,
        wallet: toWallet(input.phone),
        customerFirstName: input.recipient.firstName,
        customerLastName: input.recipient.lastName,
        referenceId: input.transactionId,
        ...(input.description ? { description: input.description } : {}),
        ...(hook ? { webhookUrl: hook } : {}),
      },
      true // a lost response may hide a transfer that did go out
    );
    if (res.status >= 400 && res.status < 500) {
      await noteFailure("createTransfer", input.requestId, started, `transfer rejected: ${describe(res)}`);
      // 4xx: the provider refused it and nothing was sent (e.g. the operator's wallet is short).
      throw new AppError("PROVIDER_ERROR", "The transfer could not be processed right now.");
    }
    const id = res.json.transaction_id;
    if (res.status < 200 || res.status >= 300 || typeof id !== "string" || !id) {
      // 5xx or an unreadable success: the outcome is unknown. Keep the funds
      // reserved and let reconciliation or an administrator settle it.
      await noteFailure("createTransfer", input.requestId, started, `transfer outcome unknown: ${describe(res)}`);
      throw new AppError("PROVIDER_TIMEOUT", "The provider did not confirm the transfer.");
    }
    return { providerTransactionId: id, status: mapProviderStatus(res.json.status) };
  }

  async getPayment(_network: NetworkCode, providerTransactionId: string): Promise<ProviderPayment> {
    // A transfer is looked up with the account that sent it, a payment with the one that collected it.
    const cfg = await requireConfig(isTransferId(providerTransactionId) ? "send" : "receive");
    const path = isTransferId(providerTransactionId) ? `/transfers/${encodeURIComponent(providerTransactionId)}` : `/order/${encodeURIComponent(providerTransactionId)}`;
    const started = Date.now();
    const res = await call(cfg, "getPayment", undefined, "GET", path);
    if (res.status < 200 || res.status >= 300) {
      await noteFailure("getPayment", undefined, started, `status lookup failed: ${describe(res)}`);
      throw new AppError("PROVIDER_ERROR", "The provider could not report the transaction status.");
    }
    // Some responses wrap the record.
    const data = (typeof res.json.transaction === "object" && res.json.transaction ? res.json.transaction : res.json) as Record<string, unknown>;
    const amount = typeof data.amount === "number" ? data.amount : typeof data.gourdes === "number" ? data.gourdes : undefined;
    return { providerTransactionId, status: mapProviderStatus(data.status), amount };
  }

  // The wallet that pays transfers out.
  async getBalance(_network: NetworkCode): Promise<ProviderBalance> {
    const cfg = await requireConfig("send");
    let res = await call(cfg, "getBalance", undefined, "GET", "/balance");
    if (res.status === 404) res = await call(cfg, "getBalance", undefined, "GET", "/wallet");
    const available = Number(res.json.available ?? res.json.balance);
    if (res.status < 200 || res.status >= 300 || !Number.isFinite(available)) {
      throw new AppError("PROVIDER_ERROR", "The provider balance is not available.");
    }
    return { available, currency: "HTG" };
  }

  // The result is only ever surfaced through the admin API. Checks the "receive"
  // credentials and, when the account for sending money is a different one, that too.
  async healthCheck(): Promise<ProviderHealth> {
    const started = Date.now();
    const receive = await getEffectiveConfig("receive");
    const send = await getEffectiveConfig("send");
    if (!receive.configured && !send.configured) {
      return { ok: false, responseMs: Date.now() - started, message: `${receive.name} credentials are not configured` };
    }
    const parts: string[] = [];
    let ok = true;
    const check = async (label: string, cfg: EffectiveConfig, withBalance: boolean) => {
      const host = new URL(cfg.apiUrl).host;
      try {
        await getToken(cfg, true);
      } catch {
        ok = false;
        parts.push(`${label}: authentication failed — check the credentials (${host})`);
        return;
      }
      if (!withBalance) return void parts.push(`${label}: connected (${host})`);
      try {
        const balance = await this.getBalance("MONCASH");
        parts.push(`${label}: connected (${host}); wallet ${balance.available} HTG`);
      } catch {
        parts.push(`${label}: connected (${host}); wallet balance unavailable`);
      }
    };
    if (receive.configured) await check("receive", receive, false);
    else parts.push("receive: not configured");
    if (send.configured) await check(send.inherited ? "send (same account)" : "send", send, true);
    else parts.push("send: not configured");
    return { ok: ok && (receive.configured || send.configured), responseMs: Date.now() - started, message: `${receive.name} — ${parts.join(" · ")}` };
  }
}
