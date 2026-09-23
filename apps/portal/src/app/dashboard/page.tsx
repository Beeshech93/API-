"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useErrorMessage, useT } from "@/lib/i18n";
import { BarChart, Card, ErrorNote, PageTitle, ProgressBar, Stat, lastNDays } from "@/components/ui";

interface Overview {
  plan: { code: string; name: string } | null;
  subscription_status: string;
  live_access: boolean;
  requests: { used: number; limit: number | null; remaining: number | null; period: string };
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

  const limit = data.plan ? data.requests.limit : null;
  return (
    <div>
      <PageTitle title={t("nav.dashboard")} subtitle={t("overview.subtitle")} />

      {!data.live_access && (
        <Card className="p-5 mb-6 border-brand/40 bg-brand-100">
          <p className="font-semibold text-navy">{t("overview.noPlanTitle")}</p>
          <p className="text-sm text-slate-600 mt-1">{t("overview.noPlanBody")}</p>
          <Link href="/dashboard/billing" className="inline-block mt-3 bg-brand text-white px-4 py-2 rounded-lg text-sm font-semibold">
            {t("overview.choosePlan")}
          </Link>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Stat label={t("overview.requests")} value={limit === null ? fmt(data.requests.used) : `${fmt(data.requests.used)} / ${fmt(limit)}`} hint={!data.plan ? t("status.none") : data.requests.remaining === null ? t("overview.unlimited") : `${fmt(data.requests.remaining)} ${t("overview.remaining")}`} />
        <Stat label={t("overview.transactions")} value={fmt(data.transactions.total)} hint={`${fmt(data.transactions.completed)} ${t("overview.successful")} · ${fmt(data.transactions.failed)} ${t("overview.failed")}`} />
        <Stat label={t("overview.successRate")} value={data.success_rate === null ? "—" : `${data.success_rate}%`} tone={data.success_rate !== null && data.success_rate >= 95 ? "good" : "default"} />
        <Stat label={t("overview.plan")} value={data.plan?.name ?? "—"} hint={t(`status.${data.subscription_status}`)} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label={t("overview.uptime")} value={data.api_uptime === null ? "—" : `${data.api_uptime}%`} />
        <Stat label={t("overview.activeKeys")} value={data.active_api_keys} />
        <Card className="p-5 col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-3">{t("overview.monthlyUsage")}</p>
          <ProgressBar value={data.requests.used} max={limit} />
          <p className="text-xs text-slate-500 mt-2">{data.requests.period}</p>
        </Card>
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
