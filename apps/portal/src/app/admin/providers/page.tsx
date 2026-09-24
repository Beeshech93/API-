"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useErrorMessage, useT } from "@/lib/i18n";
import { Badge, Button, Card, ErrorNote, PageTitle, TextInput } from "@/components/ui";

interface Provider { code: string; name: string; status: string; error_rate: number; response_time_ms: number | null; message: string | null }
type Role = "receive" | "send";
interface Config { role: Role; inherited: boolean; source: "admin" | "env" | "none"; configured: boolean; name: string; api_url: string; api_key: string | null; secret_key: string | null; webhook_secret: string | null; editable: boolean }

const EMPTY = { name: "", apiUrl: "", apiKey: "", secretKey: "", webhookSecret: "" };

export default function ProvidersPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [role, setRole] = useState<Role>("receive");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [p, c] = await Promise.all([api<{ providers: Provider[] }>("/admin/providers"), api<{ config: Config }>(`/admin/providers/config?role=${role}`)]);
      setProviders(p.providers);
      setConfig(c.config);
      setForm({ ...EMPTY, name: c.config.name === "Payment provider" ? "" : c.config.name, apiUrl: c.config.api_url });
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  useEffect(() => {
    setConfig(null);
    setSaved(false);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      // Secrets left blank are omitted, so the stored values are kept.
      const body: Record<string, string> = { apiUrl: form.apiUrl, name: form.name };
      for (const f of ["apiKey", "secretKey", "webhookSecret"] as const) if (form[f].trim()) body[f] = form[f];
      await api(`/admin/providers/config?role=${role}`, { method: "PUT", body });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    });

  const primary = providers.find((p) => p.code === "primary");
  const set = (patch: Partial<typeof EMPTY>) => setForm({ ...form, ...patch });
  const secretPlaceholder = (masked: string | null | undefined) => (masked ? `${masked} — ${t("admin.cfg.keepBlank")}` : t("admin.cfg.notSet"));

  return (
    <div>
      <PageTitle title={t("admin.providers")} subtitle={t("admin.providersSubtitle")} action={<Button variant="secondary" disabled={busy} onClick={() => run(() => api("/admin/providers/check", { method: "POST" }))}>{t("admin.testConnection")}</Button>} />
      <ErrorNote message={error} />

      {primary && config && (
        <Card className="p-5 mb-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-bold text-navy text-lg">{primary.name}</h2>
            <Badge value={primary.status === "operational" ? "operational" : "down"} label={primary.status === "operational" ? "CONNECTED" : "DISCONNECTED"} />
          </div>
          <p className="text-sm text-slate-600 mt-2">{t(`admin.cfg.src.${config.source}`)}</p>
          {primary.message && <p className="text-xs text-slate-500 mt-1">{primary.message}</p>}
        </Card>
      )}

      {config && (
        <Card className="p-5 mb-6 max-w-2xl">
          <div role="tablist" className="flex gap-2 mb-4">
            {(["receive", "send"] as const).map((r) => (
              <button key={r} role="tab" aria-selected={role === r} type="button" onClick={() => setRole(r)} className={`px-4 py-2 rounded-full border text-sm font-medium ${role === r ? "bg-brand text-white border-brand" : "border-slate-300 text-slate-600 hover:border-brand"}`}>
                {t(`admin.cfg.role.${r}`)}
              </button>
            ))}
          </div>
          <h2 className="font-semibold text-navy">{t(`admin.cfg.role.${role}`)}</h2>
          <p className="text-sm text-slate-600 mt-1 mb-2">{t(`admin.cfg.role.${role}.sub`)}</p>
          <p className="text-sm text-slate-600 mb-4">{t("admin.cfg.subtitle")}</p>
          {role === "send" && config.inherited && <p className="text-sm rounded-lg bg-brand-50 text-brand-600 px-3 py-2 mb-4">{t("admin.cfg.sendInherits")}</p>}
          {role === "send" && !config.configured && <p className="text-sm rounded-lg bg-amber-50 text-amber-700 px-3 py-2 mb-4">{t("admin.cfg.sendMissing")}</p>}
          <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-3">
            <TextInput label={t("admin.cfg.name")} value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} autoComplete="off" />
            <TextInput label={t("admin.cfg.apiUrl")} type="url" value={form.apiUrl} onChange={(e) => set({ apiUrl: e.target.value })} placeholder="https://" autoComplete="off" />
            <TextInput label={t("admin.cfg.apiKey")} type="password" value={form.apiKey} onChange={(e) => set({ apiKey: e.target.value })} placeholder={secretPlaceholder(config.api_key)} autoComplete="new-password" />
            <TextInput label={t("admin.cfg.secretKey")} type="password" value={form.secretKey} onChange={(e) => set({ secretKey: e.target.value })} placeholder={secretPlaceholder(config.secret_key)} autoComplete="new-password" />
            <TextInput label={t("admin.cfg.webhookSecret")} type="password" value={form.webhookSecret} onChange={(e) => set({ webhookSecret: e.target.value })} placeholder={secretPlaceholder(config.webhook_secret)} autoComplete="new-password" />
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button type="submit" disabled={busy || !form.apiUrl.trim()}>{t("admin.cfg.save")}</Button>
              {config.source === "admin" && <Button variant="danger" disabled={busy} onClick={() => confirm(t("admin.cfg.confirmClear")) && run(() => api(`/admin/providers/config?role=${role}`, { method: "DELETE" }))}>{t("admin.cfg.clear")}</Button>}
              {saved && <Badge value="active" label={t("common.saved")} />}
            </div>
          </form>
          <p className="text-xs text-slate-500 mt-4">{t("admin.envOnly")}</p>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {providers.filter((p) => p.code !== "primary").map((p) => (
          <Card key={p.code} className="p-5">
            <div className="flex items-center justify-between"><h2 className="font-bold text-navy">{p.name}</h2><Badge value={p.status} label={t(`status.${p.status}`)} /></div>
            <p className="text-xs text-slate-500 mt-3">{t("admin.errorRate")}: {(p.error_rate * 100).toFixed(1)}% · {p.response_time_ms ?? "—"} ms</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
