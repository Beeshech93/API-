"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useErrorMessage, useT } from "@/lib/i18n";
import { Badge, ErrorNote, PageTitle, Table } from "@/components/ui";

interface Row { id: string; client_id: string; provider: string; status: string; environment: string; amount: number; currency: string; request_id: string; created_at: string }

export default function AdminTransactions() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ transactions: Row[] }>("/admin/transactions").then((d) => setRows(d.transactions)).catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div>
      <PageTitle title={t("nav.transactions")} />
      <ErrorNote message={error} />
      <Table head={[t("tx.id"), t("admin.client"), t("tx.provider"), t("tx.amount"), t("keys.environment"), t("common.status"), t("tx.created")]} empty={t("tx.empty")}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="font-mono text-xs">{r.id}</td>
            <td className="font-mono text-xs">{r.client_id.slice(0, 8)}</td>
            <td className="capitalize">{r.provider}</td>
            <td>{r.amount} {r.currency}</td>
            <td><Badge value={r.environment} label={t(`env.${r.environment}`)} /></td>
            <td><Badge value={r.status} label={t(`status.${r.status}`)} /></td>
            <td>{new Date(r.created_at).toLocaleString()}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
