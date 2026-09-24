"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useErrorMessage, useT } from "@/lib/i18n";
import { Badge, BarChart, Card, ErrorNote, PageTitle, Stat, lastNDays } from "@/components/ui";

interface Overview {
  live_access: boolean;
  services: { receive: boolean; send: boolean };
  requests: { used: number; period: string };
  transactions: { total: number; completed: number; failed: number };
  success_rate: number | null;
  api_uptime: number | null;
  active_api_keys: number;
  charts: {
    requests_per_day: { day: string; requests: number; failed: number }[];
    transactions_per_day: { day: string; transactions: number; completed: number; failed: number }[];
  };
}

const fmt = (n: number) => new Intl.NumberFormat().format(n);

export default function OverviewPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Overview>("/portal/overview").then(setData).catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <p className="text-slate-500">{t("common.loading")}</p>;

  return (
    <div>
      <PageTitle title={t("nav.dashboard")} subtitle={t("overview.subtitle")} />
      <div className="flex flex-wrap gap-2 mb-4">
        {data.services.receive && <Badge value="live" label={t("auth.services.receive")} />}
        {data.services.send && <Badge value="live" label={t("auth.services.send")} />}
      </div>

      {!data.live_access && (
        <Card className="p-5 mb-6 border-brand/40 bg-brand-100">
          <p className="font-semibold text-navy">{t("overview.liveOffTitle")}</p>
          <p className="text-sm text-slate-600 mt-1">{t("overview.liveOffBody")}</p>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Stat label={t("overview.requests")} value={fmt(data.requests.used)} hint={data.requests.period} />
        <Stat label={t("overview.transactions")} value={fmt(data.transactions.total)} hint={`${fmt(data.transactions.completed)} ${t("overview.successful")} · ${fmt(data.transactions.failed)} ${t("overview.failed")}`} />
        <Stat label={t("overview.successRate")} value={data.success_rate === null ? "—" : `${data.success_rate}%`} tone={data.success_rate !== null && data.success_rate >= 95 ? "good" : "default"} />
        <Stat label={t("overview.liveAccess")} value={data.live_access ? t("overview.liveOn") : t("overview.liveOff")} tone={data.live_access ? "good" : "default"} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label={t("overview.uptime")} value={data.api_uptime === null ? "—" : `${data.api_uptime}%`} />
        <Stat label={t("overview.activeKeys")} value={data.active_api_keys} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5">
          <p className="font-semibold text-navy mb-3">{t("overview.requestsPerDay")}</p>
          <BarChart data={lastNDays(data.charts.requests_per_day, "requests")} />
        </Card>
        <Card className="p-5">
          <p className="font-semibold text-navy mb-3">{t("overview.transactionsPerDay")}</p>
          <BarChart data={lastNDays(data.charts.transactions_per_day, "transactions")} />
        </Card>
        <Card className="p-5">
          <p className="font-semibold text-navy mb-3">{t("overview.failedRequests")}</p>
          <BarChart data={lastNDays(data.charts.requests_per_day, "failed")} color="#dc2626" />
        </Card>
        <Card className="p-5">
          <p className="font-semibold text-navy mb-3">{t("overview.successPerDay")}</p>
          <BarChart data={lastNDays(data.charts.transactions_per_day, "completed")} color="#059669" />
        </Card>
      </div>
    </div>
  );
}
