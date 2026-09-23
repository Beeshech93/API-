"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useErrorMessage, useT } from "@/lib/i18n";
import { BarChart, Card, ErrorNote, PageTitle, Table } from "@/components/ui";

interface Usage { history: { period: string; requests: number; transactions: number }[] }

export default function UsagePage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [data, setData] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Usage>("/portal/usage").then(setData).catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = data?.history[0];
  return (
    <div>
      <PageTitle title={t("nav.usage")} subtitle={t("usage.subtitle")} />
      <ErrorNote message={error} />
      {data && (
        <>
          <Card className="p-5 mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="font-semibold text-navy">{current?.period ?? "—"}</span>
              <span>{current?.requests ?? 0}</span>
            </div>
            <p className="text-xs text-slate-500">{t("usage.liveOnly")}</p>
          </Card>
          <Card className="p-5 mb-6">
            <p className="font-semibold text-navy mb-3">{t("usage.history")}</p>
            <BarChart data={[...data.history].reverse().map((h) => ({ label: h.period, value: h.requests }))} />
          </Card>
          <Table head={[t("usage.period"), t("overview.requests"), t("overview.transactions")]} empty={t("usage.empty")}>
            {data.history.map((h) => (
              <tr key={h.period}><td>{h.period}</td><td>{h.requests}</td><td>{h.transactions}</td></tr>
            ))}
          </Table>
        </>
      )}
    </div>
  );
}
