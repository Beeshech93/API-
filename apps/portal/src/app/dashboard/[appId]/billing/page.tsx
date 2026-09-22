"use client";

import { useEffect, useMemo, useState } from "react";
import { callPortalApi } from "@/lib/apiClient";
import { LedgerEntry } from "@/lib/types";

export default function BillingPage({ params }: { params: { appId: string } }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);

  useEffect(() => {
    callPortalApi<LedgerEntry[]>(`/portal/applications/${params.appId}/ledger`).then(setEntries);
  }, [params.appId]);

  const monthTotal = useMemo(() => {
    const now = new Date();
    return entries
      .filter((e) => {
        const created = new Date(e.createdAt);
        return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
      })
      .reduce((sum, e) => sum + Number(e.feeAmount), 0);
  }, [entries]);

  return (
    <div>
      <h2 className="text-lg font-semibold text-navy mb-2">Billing</h2>
      <p className="text-sm text-slate-500 mb-6">
        AyitiPay charges a small platform fee per successful transaction. This is a running record of what&apos;s
        owed — v1 does not process this fee automatically.
      </p>

      <div className="bg-white border border-slate-200 rounded-lg p-5 mb-6 inline-block">
        <p className="text-xs text-slate-500">This month</p>
        <p className="text-2xl font-bold text-navy">{monthTotal.toFixed(2)}</p>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-200">
            <th className="py-2">Reference</th>
            <th>Provider</th>
            <th>Fee</th>
            <th>Rate (bps)</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-slate-100">
              <td className="py-2">{entry.transaction.reference}</td>
              <td>{entry.transaction.provider}</td>
              <td>
                {entry.feeAmount} {entry.feeCurrency}
              </td>
              <td>{entry.feeBps}</td>
              <td>{new Date(entry.createdAt).toLocaleString()}</td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-slate-400">
                No billable transactions yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
