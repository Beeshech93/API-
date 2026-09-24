"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useErrorMessage, useT } from "@/lib/i18n";
import { Badge, ErrorNote, PageTitle, Stat } from "@/components/ui";

interface Overview {
  total_clients: number; live_clients: number; pending_fundings: number; api_requests: number;
  transactions: number; failed_transactions: number;
  volume: { provider: string; currency: string; amount: number }[];
  system_status: { code: string; name: string; status: string }[];
}

export default function AdminOverview() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [d, setD] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Overview>("/admin/overview").then(setD).catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (error) return <ErrorNote message={error} />;
  if (!d) return <p className="text-slate-500">{t("common.loading")}</p>;
  const vol = (p: string) => d.volume.filter((v) => v.provider === p).map((v) => `${new Intl.NumberFormat().format(v.amount)} ${v.currency}`).join(" · ") || "0";
  return (
    <div>
      <PageTitle title={t("admin.overview")} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Stat label={t("admin.totalClients")} value={d.total_clients} />
        <Stat label={t("admin.liveClients")} value={d.live_clients} />
        <Stat label={t("admin.pendingFunding")} value={d.pending_fundings} tone={d.pending_fundings ? "bad" : "default"} />
        <Stat label={t("overview.requests")} value={new Intl.NumberFormat().format(d.api_requests)} />
        <Stat label={t("overview.transactions")} value={d.transactions} hint="LIVE" />
        <Stat label={t("overview.failed")} value={d.failed_transactions} tone={d.failed_transactions ? "bad" : "default"} />
        <Stat label="MonCash" value={vol("moncash")} />
        <Stat label="NatCash" value={vol("natcash")} />
      </div>
      <h2 className="font-semibold text-navy mb-2">{t("admin.systemStatus")}</h2>
      <div className="flex flex-wrap gap-3">
        {d.system_status.map((p) => (
          <div key={p.code} className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm flex items-center gap-3">
            <span className="font-semibold uppercase">{p.name}</span>
            <Badge value={p.status} label={t(`status.${p.status}`)} />
          </div>
        ))}
      </div>
    </div>
  );
}
