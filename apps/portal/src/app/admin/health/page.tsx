"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useErrorMessage, useT } from "@/lib/i18n";
import { Badge, Button, Card, ErrorNote, PageTitle, Table } from "@/components/ui";

interface Provider { code: string; name: string; status: string; last_checked_at: string | null; last_success_at: string | null; response_time_ms: number | null; error_rate: number }

export default function HealthPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [sus, setSus] = useState<{ failed_logins: { ip: string; attempts: number }[]; rejected_api_keys: { ip: string; requests: number }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setProviders((await api<{ providers: Provider[] }>("/admin/providers")).providers);
      setSus(await api("/admin/security/suspicious"));
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dot = (s: string) => (s === "operational" ? "text-emerald-500" : s === "degraded" ? "text-amber-500" : s === "down" ? "text-red-500" : "text-slate-400");
  const board = [{ code: "api", name: "API", status: "operational" }, ...providers];

  return (
    <div>
      <PageTitle title={t("admin.health")} action={<Button variant="secondary" onClick={async () => { await api("/admin/providers/check", { method: "POST" }); await load(); }}>{t("admin.refresh")}</Button>} />
      <ErrorNote message={error} />
      <Card className="p-5 mb-6 font-mono text-sm space-y-2">
        {board.map((p) => (
          <div key={p.code} className="flex gap-6"><span className="w-28 uppercase">{p.name}</span><span className={dot(p.status)}>● {t(`status.${p.status}`)}</span></div>
        ))}
      </Card>
      <Table head={[t("tx.provider"), t("common.status"), t("admin.responseTime"), t("admin.errorRate"), t("admin.lastSuccess"), t("admin.lastChecked")]} empty={t("common.empty")}>
        {providers.map((p) => (
          <tr key={p.code}><td className="font-medium">{p.name}</td><td><Badge value={p.status} label={t(`status.${p.status}`)} /></td><td>{p.response_time_ms ?? "—"} ms</td><td>{(p.error_rate * 100).toFixed(1)}%</td><td>{p.last_success_at ? new Date(p.last_success_at).toLocaleString() : "—"}</td><td>{p.last_checked_at ? new Date(p.last_checked_at).toLocaleString() : "—"}</td></tr>
        ))}
      </Table>
      <h2 className="font-semibold text-navy mt-8 mb-2">{t("admin.suspicious")}</h2>
      <Table head={["IP", t("admin.reason"), t("admin.count")]} empty={t("admin.noSuspicious")}>
        {[...(sus?.failed_logins ?? []).map((x) => ({ ip: x.ip, reason: t("admin.failedLogins"), n: x.attempts })), ...(sus?.rejected_api_keys ?? []).map((x) => ({ ip: x.ip, reason: t("admin.badKeys"), n: x.requests }))].map((x, i) => (
          <tr key={i}><td className="font-mono">{x.ip}</td><td>{x.reason}</td><td>{x.n}</td></tr>
        ))}
      </Table>
    </div>
  );
}
