"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useErrorMessage, useT } from "@/lib/i18n";
import { Badge, Button, Card, ErrorNote, PageTitle } from "@/components/ui";

interface Provider { code: string; name: string; status: string; last_checked_at: string | null; last_success_at: string | null; response_time_ms: number | null; error_rate: number; message: string | null; credentials?: string }

export default function ProvidersPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ providers: Provider[] }>("/admin/providers").then((d) => setProviders(d.providers)).catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function check() {
    setBusy(true);
    setError(null);
    try {
      setProviders((await api<{ providers: Provider[] }>("/admin/providers/check", { method: "POST" })).providers);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const bazik = providers.find((p) => p.code === "bazik");
  return (
    <div>
      <PageTitle title={t("admin.providers")} subtitle={t("admin.providersSubtitle")} action={<Button onClick={check} disabled={busy}>{t("admin.testConnection")}</Button>} />
      <ErrorNote message={error} />
      {bazik && (
        <Card className="p-5 mb-6">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-navy text-lg">Bazik</h2>
            <Badge value={bazik.status === "operational" ? "operational" : "down"} label={bazik.status === "operational" ? "CONNECTED" : "DISCONNECTED"} />
          </div>
          <dl className="text-sm mt-4 space-y-2">
            <div className="flex justify-between"><dt className="text-slate-500">BAZIK_API_URL / API_KEY / SECRET_KEY</dt><dd className="font-mono">{bazik.credentials === "configured" ? "••••••••••••" : t("admin.credMissing")}</dd></div>
            {bazik.message && <div className="flex justify-between gap-4"><dt className="text-slate-500">{t("admin.detail")}</dt><dd className="text-right">{bazik.message}</dd></div>}
          </dl>
          <p className="text-xs text-slate-500 mt-4">{t("admin.envOnly")}</p>
        </Card>
      )}
      <div className="grid md:grid-cols-3 gap-4">
        {providers.filter((p) => p.code !== "bazik").map((p) => (
          <Card key={p.code} className="p-5">
            <div className="flex items-center justify-between"><h2 className="font-bold text-navy">{p.name}</h2><Badge value={p.status} label={t(`status.${p.status}`)} /></div>
            <p className="text-xs text-slate-500 mt-3">{t("admin.errorRate")}: {(p.error_rate * 100).toFixed(1)}% · {p.response_time_ms ?? "—"} ms</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
