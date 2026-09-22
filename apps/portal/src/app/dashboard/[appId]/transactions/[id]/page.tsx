"use client";

import { useEffect, useState } from "react";
import { callPortalApi } from "@/lib/apiClient";
import { TransactionDto } from "@ayitipay/shared";

interface TransactionEvent {
  id: string;
  status: string;
  source: string;
  createdAt: string;
}

export default function TransactionDetailPage({ params }: { params: { appId: string; id: string } }) {
  const [transaction, setTransaction] = useState<(TransactionDto & { events: TransactionEvent[] }) | null>(null);

  useEffect(() => {
    callPortalApi<TransactionDto & { events: TransactionEvent[] }>(
      `/portal/applications/${params.appId}/transactions/${params.id}`
    ).then(setTransaction);
  }, [params.appId, params.id]);

  if (!transaction) return <p className="text-slate-400">Loading…</p>;

  return (
    <div>
      <h2 className="text-lg font-semibold text-navy mb-4">Transaction {transaction.reference}</h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm bg-white border border-slate-200 rounded-lg p-5 mb-6">
        <Row label="Status" value={transaction.status} />
        <Row label="Provider" value={transaction.provider} />
        <Row label="Mode" value={transaction.mode} />
        <Row label="Amount" value={`${transaction.amount} ${transaction.currency}`} />
        <Row label="Provider payment id" value={transaction.providerPaymentId ?? "—"} />
        <Row label="Created" value={new Date(transaction.createdAt).toLocaleString()} />
      </dl>

      <h3 className="font-semibold text-navy text-sm mb-2">Event history</h3>
      <ul className="space-y-2 text-sm">
        {transaction.events.map((event) => (
          <li key={event.id} className="bg-white border border-slate-200 rounded-lg px-4 py-2 flex justify-between">
            <span>
              {event.status} <span className="text-slate-400">via {event.source}</span>
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
