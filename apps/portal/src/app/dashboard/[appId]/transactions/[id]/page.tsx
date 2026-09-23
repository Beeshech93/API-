"use client";

import { useEffect, useState } from "react";
import { callPortalApi } from "@/lib/apiClient";
import { TransactionDto } from "@ayitipay/shared";
import { useT } from "@/lib/i18n";

interface TransactionEvent {
  id: string;
  status: string;
  source: string;
  createdAt: string;
}

export default function TransactionDetailPage({ params }: { params: { appId: string; id: string } }) {
  const t = useT();
  const [transaction, setTransaction] = useState<(TransactionDto & { events: TransactionEvent[] }) | null>(null);

  useEffect(() => {
    callPortalApi<TransactionDto & { events: TransactionEvent[] }>(
      `/portal/applications/${params.appId}/transactions/${params.id}`
    ).then(setTransaction);
  }, [params.appId, params.id]);

  if (!transaction) return <p className="text-slate-400">{t("tx.loading")}</p>;

  return (
    <div>
      <h2 className="text-lg font-semibold text-navy mb-4">{t("tx.detail")} {transaction.reference}</h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm bg-white border border-slate-200 rounded-lg p-5 mb-6">
        <Row label={t("tx.status")} value={transaction.status} />
        <Row label={t("tx.provider")} value={transaction.provider} />
        <Row label={t("tx.mode")} value={transaction.mode} />
        <Row label={t("tx.amount")} value={`${transaction.amount} ${transaction.currency}`} />
        <Row label={t("tx.providerPaymentId")} value={transaction.providerPaymentId ?? "—"} />
        <Row label={t("tx.created")} value={new Date(transaction.createdAt).toLocaleString()} />
      </dl>

      <h3 className="font-semibold text-navy text-sm mb-2">{t("tx.history")}</h3>
      <ul className="space-y-2 text-sm">
        {transaction.events.map((event) => (
          <li key={event.id} className="bg-white border border-slate-200 rounded-lg px-4 py-2 flex justify-between">
            <span>
              {event.status} <span className="text-slate-400">{t("tx.via")} {event.source}</span>
            </span>
            <span className="text-slate-400">{new Date(event.createdAt).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-navy">{value}</dd>
    </div>
  );
}
