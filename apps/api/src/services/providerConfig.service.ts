import { Prisma } from "@prisma/client";
import { prisma } from "@/utils/prisma";
import { env } from "@/config/env";
import { AppError } from "@/utils/errors";
import { assertPublicHttpUrl } from "@/utils/ssrf";
import { open, seal, SealedBox } from "@/utils/secretBox";
import { audit } from "@/services/audit.service";

// The payment provider connection. An administrator enters it manually in the
// admin panel; the environment variables (PROVIDER_*) are only a fallback for
// deployments that prefer configuring it outside the app.
//
// There are two sets of credentials, one per job:
//   - "receive": used to collect payments (and balance recharges);
//   - "send":    used to send money out (transfers).
// If no separate "send" credentials are saved, sending reuses the "receive" ones,
// so a single account still works.
//
//  - Secrets are encrypted at rest (secretBox) and are WRITE-ONLY: no endpoint
//    ever returns them, only whether they're set and the last 4 characters.
//  - The provider's identity (name) is stored here, never in public code.

export type CredentialRole = "receive" | "send";
export const CREDENTIAL_ROLES: CredentialRole[] = ["receive", "send"];

// "receive" keeps the original key, so connections saved before the split carry over.
const KEYS: Record<CredentialRole, string> = { receive: "provider_connection", send: "provider_connection_send" };

interface Secrets {
  apiKey?: string;
  secretKey?: string;
  webhookSecret?: string;
}

interface Stored {
  name?: string;
  apiUrl?: string;
  secrets?: SealedBox;
}

export interface EffectiveConfig {
  role: CredentialRole;
  name: string;
  apiUrl: string;
  apiKey: string;
  secretKey: string;
  webhookSecret: string;
  source: "admin" | "env" | "none";
  configured: boolean;
  // Sending only: no separate credentials are saved, the receive ones are used.
  inherited: boolean;
}

async function load(role: CredentialRole): Promise<Stored | null> {
  const row = await prisma.platformSetting.findUnique({ where: { key: KEYS[role] } });
  return (row?.value as Stored | undefined) ?? null;
}

function secretsOf(stored: Stored | null): Secrets {
  return stored?.secrets ? open<Secrets>(stored.secrets) : {};
}

async function ownConfig(role: CredentialRole): Promise<EffectiveConfig> {
  const stored = await load(role);
  if (stored && (stored.apiUrl || stored.secrets)) {
    const s = secretsOf(stored);
    const cfg = {
      name: stored.name || env.provider.name,
      apiUrl: stored.apiUrl ?? "",
      apiKey: s.apiKey ?? "",
      secretKey: s.secretKey ?? "",
      webhookSecret: s.webhookSecret ?? "",
    };
    return { role, ...cfg, source: "admin", configured: Boolean(cfg.apiUrl && cfg.apiKey && cfg.secretKey), inherited: false };
  }
  // The environment variables describe a single account: they belong to "receive".
  if (role === "receive") {
    const e = env.provider;
    const configured = Boolean(e.apiUrl && e.apiKey && e.secretKey);
    return { role, name: e.name, apiUrl: e.apiUrl, apiKey: e.apiKey, secretKey: e.secretKey, webhookSecret: e.webhookSecret, source: configured ? "env" : "none", configured, inherited: false };
  }
  return { role, name: env.provider.name, apiUrl: "", apiKey: "", secretKey: "", webhookSecret: "", source: "none", configured: false, inherited: false };
}

export async function getEffectiveConfig(role: CredentialRole = "receive"): Promise<EffectiveConfig> {
  const own = await ownConfig(role);
  if (role === "send" && !own.configured) {
    const shared = await ownConfig("receive");
    return { ...shared, role: "send", inherited: shared.configured };
  }
  return own;
}

// Every webhook secret that may legitimately sign a notification.
export async function getWebhookSecrets(): Promise<string[]> {
  const secrets = await Promise.all(CREDENTIAL_ROLES.map(async (r) => (await getEffectiveConfig(r)).webhookSecret));
  return [...new Set(secrets.filter(Boolean))];
}

const mask = (v: string) => (v ? `${"•".repeat(12)}${v.slice(-4)}` : null);

// Safe to return to an administrator: never contains a secret.
export async function getConfigSummary(role: CredentialRole = "receive") {
  const c = await getEffectiveConfig(role);
  const stored = await load(role);
  return {
    role,
    source: c.source,
    configured: c.configured,
    inherited: c.inherited,
    name: c.name,
    api_url: c.apiUrl,
    api_key: mask(c.apiKey),
    secret_key: mask(c.secretKey),
    webhook_secret: mask(c.webhookSecret),
    updated_at: (await prisma.platformSetting.findUnique({ where: { key: KEYS[role] } }))?.updatedAt ?? null,
    editable: Boolean(stored) || c.source !== "env",
  };
}

export interface ConfigInput {
  name?: string;
  apiUrl?: string;
  apiKey?: string;
  secretKey?: string;
  webhookSecret?: string;
}

// Blank/omitted secret fields keep the stored value, so an admin can change the
// URL or name without re-typing credentials they can't see.
export async function saveConfig(input: ConfigInput, actor: { userId: string; ip?: string }, role: CredentialRole = "receive") {
  if (input.apiUrl) await assertPublicHttpUrl(input.apiUrl);

  const current = await load(role);
  const merged: Secrets = { ...secretsOf(current) };
  const changed: string[] = [];
  for (const field of ["apiKey", "secretKey", "webhookSecret"] as const) {
    const v = input[field]?.trim();
    if (v) {
      merged[field] = v;
      changed.push(field);
    }
  }
  const next: Stored = {
    name: input.name?.trim() || current?.name,
    apiUrl: input.apiUrl?.trim() || current?.apiUrl,
    secrets: Object.keys(merged).length ? seal(merged) : undefined,
  };
  if (input.name !== undefined) changed.push("name");
  if (input.apiUrl !== undefined) changed.push("apiUrl");

  await prisma.platformSetting.upsert({
    where: { key: KEYS[role] },
    create: { key: KEYS[role], value: next as unknown as Prisma.InputJsonValue },
    update: { value: next as unknown as Prisma.InputJsonValue },
  });
  // Only the *names* of changed fields are audited, never values.
  await audit({ action: "admin.provider_config_saved", actorUserId: actor.userId, ip: actor.ip, metadata: { role, fields: changed } });
  return getConfigSummary(role);
}

export async function clearConfig(actor: { userId: string; ip?: string }, role: CredentialRole = "receive") {
  await prisma.platformSetting.deleteMany({ where: { key: KEYS[role] } });
  await audit({ action: "admin.provider_config_cleared", actorUserId: actor.userId, ip: actor.ip, metadata: { role } });
  return getConfigSummary(role);
}

export function assertRole(value: unknown): CredentialRole {
  if (value === undefined) return "receive";
  if (value === "receive" || value === "send") return value;
  throw new AppError("INVALID_REQUEST", "Unknown credentials role.");
}
