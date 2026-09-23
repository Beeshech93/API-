"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useErrorMessage, useT } from "@/lib/i18n";
import { Badge, Card, ErrorNote, PageTitle } from "@/components/ui";
import type { Tx } from "../page";

export default function TransactionDetailPage({ params }: { params: { id: string } }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [tx, setTx] = useState<(Tx & { events: { status: string; source: string; created_at: string }[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api(`/portal/transactions/${params.id}`).then(setTx).catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (error) return <ErrorNote message={error} />;
  if (!tx) return <p className="text-slate-500">{t("common.loading")}</p>;

  const rows: [string, React.ReactNode][] = [
    [t("tx.id"), <code key="i" className="text-xs">{tx.transaction_id}</code>],
    [t("common.status"), <Badge key="s" value={tx.status} label={t(`status.${tx.status}`)} />],
    [t("tx.provider"), <span key="p" className="capitalize">{tx.provider}</span>],
    [t("keys.environment"), t(`env.${tx.environment}`)],
    [t("tx.amount"), `${tx.amount} ${tx.currency}`],
    [t("tx.fee"), `${tx.fee} ${tx.currency}`],
    [t("tx.total"), `${tx.total} ${tx.currency}`],
    [t("tx.phone"), tx.phone],
    [t("tx.reference"), tx.reference ?? "—"],
    [t("tx.requestId"), <code key="r" className="text-xs">{tx.request_id}</code>],
    [t("tx.created"), new Date(tx.created_at).toLocaleString()],
    ...(tx.error ? ([[t("tx.error"), `${tx.error.code}: ${tx.error.message}`]] as [string, React.ReactNode][]) : []),
  ];

  return (
    <div>
      <Link href="/dashboard/transactions" className="text-sm text-electric underline">← {t("nav.transactions")}</Link>
      <PageTitle title={t("tx.detail")} />
      <Card className="p-5 mb-6">
        <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-slate-500">{label}</dt>
              <dd className="font-medium text-navy break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <h2 className="font-semibold text-navy mb-2">{t("tx.history")}</h2>
      <Card>
        <ul className="divide-y divide-slate-100 text-sm">
          {tx.events.map((e, i) => (
            <li key={i} className="flex justify-between px-4 py-3">
              <span><Badge value={e.status} label={t(`status.${e.status}`)} /> <span className="text-slate-400 ml-2">{t("tx.via")} {e.source}</span></span>
              <span className="text-slate-400">{new Date(e.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
