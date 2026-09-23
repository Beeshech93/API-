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
//  - Secrets are encrypted at rest (secretBox) and are WRITE-ONLY: no endpoint
//    ever returns them, only whether they're set and the last 4 characters.
//  - The provider's identity (name) is stored here, never in public code.

const KEY = "provider_connection";

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
  name: string;
  apiUrl: string;
  apiKey: string;
  secretKey: string;
  webhookSecret: string;
  source: "admin" | "env" | "none";
  configured: boolean;
}

async function load(): Promise<Stored | null> {
  const row = await prisma.platformSetting.findUnique({ where: { key: KEY } });
  return (row?.value as Stored | undefined) ?? null;
}

function secretsOf(stored: Stored | null): Secrets {
  return stored?.secrets ? open<Secrets>(stored.secrets) : {};
}

export async function getEffectiveConfig(): Promise<EffectiveConfig> {
  const stored = await load();
  if (stored && (stored.apiUrl || stored.secrets)) {
    const s = secretsOf(stored);
    const cfg = {
      name: stored.name || env.provider.name,
      apiUrl: stored.apiUrl ?? "",
      apiKey: s.apiKey ?? "",
      secretKey: s.secretKey ?? "",
      webhookSecret: s.webhookSecret ?? "",
    };
    return { ...cfg, source: "admin", configured: Boolean(cfg.apiUrl && cfg.apiKey && cfg.secretKey) };
  }
  const e = env.provider;
  const configured = Boolean(e.apiUrl && e.apiKey && e.secretKey);
  return { name: e.name, apiUrl: e.apiUrl, apiKey: e.apiKey, secretKey: e.secretKey, webhookSecret: e.webhookSecret, source: configured ? "env" : "none", configured };
}

const mask = (v: string) => (v ? `${"•".repeat(12)}${v.slice(-4)}` : null);

// Safe to return to an administrator: never contains a secret.
export async function getConfigSummary() {
  const c = await getEffectiveConfig();
  const stored = await load();
  return {
    source: c.source,
    configured: c.configured,
    name: c.name,
    api_url: c.apiUrl,
    api_key: mask(c.apiKey),
    secret_key: mask(c.secretKey),
    webhook_secret: mask(c.webhookSecret),
    updated_at: (await prisma.platformSetting.findUnique({ where: { key: KEY } }))?.updatedAt ?? null,
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
export async function saveConfig(input: ConfigInput, actor: { userId: string; ip?: string }) {
  if (input.apiUrl) await assertPublicHttpUrl(input.apiUrl);

  const current = await load();
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
    where: { key: KEY },
    create: { key: KEY, value: next as unknown as Prisma.InputJsonValue },
    update: { value: next as unknown as Prisma.InputJsonValue },
  });
  // Only the *names* of changed fields are audited, never values.
  await audit({ action: "admin.provider_config_saved", actorUserId: actor.userId, ip: actor.ip, metadata: { fields: changed } });
  return getConfigSummary();
}

export async function clearConfig(actor: { userId: string; ip?: string }) {
  await prisma.platformSetting.deleteMany({ where: { key: KEY } });
  await audit({ action: "admin.provider_config_cleared", actorUserId: actor.userId, ip: actor.ip });
  return getConfigSummary();
}
