"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { callPortalApi } from "@/lib/apiClient";
import { TransactionDto } from "@ayitipay/shared";
import { useT } from "@/lib/i18n";

export default function TransactionsPage({ params }: { params: { appId: string } }) {
  const t = useT();
  const [transactions, setTransactions] = useState<TransactionDto[]>([]);

  useEffect(() => {
    callPortalApi<TransactionDto[]>(`/portal/applications/${params.appId}/transactions`).then(setTransactions);
  }, [params.appId]);

  return (
    <div>
      <h2 className="text-lg font-semibold text-navy mb-4">{t("tx.title")}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-200">
            <th className="py-2">{t("tx.reference")}</th>
            <th>{t("tx.provider")}</th>
            <th>{t("tx.amount")}</th>
            <th>{t("tx.mode")}</th>
            <th>{t("tx.status")}</th>
            <th>{t("tx.created")}</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.id} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="py-2">
                <Link href={`/dashboard/${params.appId}/transactions/${tx.id}`} className="text-navy underline">
                  {tx.reference}
                </Link>
              </td>
              <td>{tx.provider}</td>
              <td>
                {tx.amount} {tx.currency}
              </td>
              <td>{tx.mode}</td>
              <td>
                <StatusBadge status={tx.status} />
              </td>
              <td>{new Date(tx.createdAt).toLocaleString()}</td>
            </tr>
          ))}
          {transactions.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-slate-400">
                {t("tx.empty")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-700",
    PROCESSING: "bg-blue-100 text-blue-700",
    SUCCEEDED: "bg-green-100 text-green-700",
    FAILED: "bg-red-100 text-red-700",
    CANCELLED: "bg-slate-100 text-slate-600",
    REFUNDED: "bg-purple-100 text-purple-700",
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] ?? ""}`}>{status}</span>;
}
