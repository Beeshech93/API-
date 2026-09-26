"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useErrorMessage, useT } from "@/lib/i18n";
import { Badge, Button, Card, ErrorNote, PageTitle, Table } from "@/components/ui";

interface Detail {
  client: { id: string; name: string; status: string; live_enabled: boolean; kyc_status: string; services: { receive: boolean; send: boolean }; created_at: string };
  users: { id: string; email: string; role: string }[];
  api_keys: { id: string; name: string; category: string; environment: string; last4: string; status: string; last_used_at: string | null }[];
  usage: { period: string; requests: number; transactions: number };
  transactions: { id: string; provider: string; status: string; amount: number; currency: string; created_at: string }[];
  logs: { request_id: string; endpoint: string; method: string; status_code: number; created_at: string }[];
}

export default function ClientDetail() {
  // Next 15 hands route params to pages as a promise; a client component reads them with this hook.
  const params = useParams<{ id: string }>();
  const t = useT();
  const errorMessage = useErrorMessage();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api<Detail>(`/admin/clients/${params.id}`).then(setD).catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (path: string, body?: unknown) => {
    setError(null);
    try {
      await api(`/admin/clients/${params.id}/${path}`, { method: "POST", body });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (!d) return <p className="text-slate-500">{error ?? t("common.loading")}</p>;
  return (
    <div>
      <Link href="/admin/clients" className="text-sm text-brand underline">← {t("admin.clients")}</Link>
      <PageTitle title={d.client.name} subtitle={d.users.map((u) => u.email).join(", ")} action={<Badge value={d.client.status} label={t(`status.${d.client.status}`)} />} />
      <ErrorNote message={error} />
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Card className="p-5">
          <h2 className="font-semibold text-navy mb-3">{t("admin.liveAccess")}</h2>
          <p className="text-xs text-slate-500 mb-2">{t("admin.kyc")}: <Badge value={d.client.kyc_status === "approved" ? "active" : d.client.kyc_status === "pending" ? "pending" : d.client.kyc_status === "rejected" ? "failed" : "unknown"} label={t(`kyc.status.${d.client.kyc_status}`)} /></p>
          <p className="text-sm mb-3"><Badge value={d.client.live_enabled ? "active" : "none"} label={d.client.live_enabled ? t("overview.liveOn") : t("overview.liveOff")} /></p>
          {d.client.live_enabled
            ? <Button variant="secondary" onClick={() => confirm(t("admin.confirmDisableLive")) && act("live-access", { enabled: false })}>{t("admin.disableLive")}</Button>
            : <Button onClick={() => act("live-access", { enabled: true })}>{t("admin.enableLive")}</Button>}
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold text-navy mb-3">{t("auth.services")}</h2>
          <div className="flex flex-wrap gap-4 text-sm text-slate-700 mb-3">
            {(["receive", "send"] as const).map((s) => (
              <label key={s} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={d.client.services[s]}
                  disabled={d.client.services[s] && Number(d.client.services.receive) + Number(d.client.services.send) === 1}
                  onChange={(e) => act("services", { services: (["receive", "send"] as const).filter((x) => (x === s ? e.target.checked : d.client.services[x])) })}
                />
                {t(`auth.services.${s}`)}
              </label>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold text-navy mb-3">{t("admin.account")}</h2>
          <p className="text-sm mb-3">{t("overview.requests")}: <strong>{d.usage.requests}</strong> ({d.usage.period}) · {t("overview.transactions")}: <strong>{d.usage.transactions}</strong></p>
          {d.client.status === "active" ? <Button variant="danger" onClick={() => confirm(t("admin.confirmSuspend")) && act("suspend")}>{t("admin.suspend")}</Button> : <Button onClick={() => act("reactivate")}>{t("admin.reactivate")}</Button>}
        </Card>
      </div>
      <h2 className="font-semibold text-navy mb-2">{t("nav.apiKeys")}</h2>
      <Table head={[t("keys.name"), t("keys.api"), t("keys.environment"), t("keys.key"), t("keys.lastUsed"), t("common.status")]} empty={t("keys.empty")}>
        {d.api_keys.map((k) => (
          <tr key={k.id}><td>{k.name}</td><td className="text-xs">{t(`keys.api.${k.category === "both" ? "legacy" : k.category}`)}</td><td><Badge value={k.environment} label={t(`env.${k.environment}`)} /></td><td className="font-mono text-xs">••••{k.last4}</td><td>{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : t("common.never")}</td><td><Badge value={k.status} label={t(`status.${k.status}`)} /></td></tr>
        ))}
      </Table>
      <h2 className="font-semibold text-navy mt-6 mb-2">{t("nav.transactions")}</h2>
      <Table head={[t("tx.id"), t("tx.provider"), t("tx.amount"), t("common.status"), t("tx.created")]} empty={t("tx.empty")}>
        {d.transactions.map((x) => (
          <tr key={x.id}><td className="font-mono text-xs">{x.id}</td><td className="capitalize">{x.provider}</td><td>{x.amount} {x.currency}</td><td><Badge value={x.status} label={t(`status.${x.status}`)} /></td><td>{new Date(x.created_at).toLocaleString()}</td></tr>
        ))}
      </Table>
      <h2 className="font-semibold text-navy mt-6 mb-2">{t("nav.apiLogs")}</h2>
      <Table head={[t("tx.requestId"), t("logs.method"), t("logs.endpoint"), t("common.status"), t("tx.created")]} empty={t("logs.empty")}>
        {d.logs.map((l) => (
          <tr key={l.request_id + l.created_at}><td className="font-mono text-xs">{l.request_id}</td><td>{l.method}</td><td className="font-mono text-xs">{l.endpoint}</td><td>{l.status_code}</td><td>{new Date(l.created_at).toLocaleString()}</td></tr>
        ))}
      </Table>
    </div>
  );
}
