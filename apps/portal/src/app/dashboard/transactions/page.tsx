"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useErrorMessage, useT } from "@/lib/i18n";
import { Badge, ErrorNote, PageTitle, Select, Table } from "@/components/ui";

export interface Tx {
  transaction_id: string;
  type: "payment" | "transfer";
  status: string;
  provider: string;
  amount: number;
  fee: number;
  total: number;
  currency: string;
  phone: string;
  reference: string | null;
  environment: string;
  request_id: string;
  error: { code: string; message: string } | null;
  created_at: string;
}

export default function TransactionsPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [rows, setRows] = useState<Tx[]>([]);
  const [status, setStatus] = useState("");
  const [environment, setEnvironment] = useState("");
  const [type, setType] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams({ limit: "100", ...(status ? { status } : {}), ...(environment ? { environment } : {}), ...(type ? { type } : {}) });
    api<{ transactions: Tx[] }>(`/portal/transactions?${qs}`).then((d) => setRows(d.transactions)).catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, environment, type]);

  return (
    <div>
      <PageTitle title={t("nav.transactions")} subtitle={t("tx.subtitle")} />
      <div className="flex flex-wrap gap-3 mb-4 max-w-md">
        <Select label={t("common.status")} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t("common.all")}</option>
          {["pending", "processing", "completed", "failed", "cancelled"].map((s) => (
            <option key={s} value={s}>{t(`status.${s}`)}</option>
          ))}
        </Select>
        <Select label={t("tx.type")} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">{t("common.all")}</option>
          <option value="payment">{t("tx.payment")}</option>
          <option value="transfer">{t("tx.transfer")}</option>
        </Select>
        <Select label={t("keys.environment")} value={environment} onChange={(e) => setEnvironment(e.target.value)}>
          <option value="">{t("common.all")}</option>
          <option value="test">{t("env.test")}</option>
          <option value="live">{t("env.live")}</option>
        </Select>
      </div>
      <ErrorNote message={error} />
      <Table head={[t("tx.id"), t("tx.type"), t("tx.provider"), t("tx.amount"), t("tx.fee"), t("tx.phone"), t("keys.environment"), t("common.status"), t("tx.created")]} empty={t("tx.empty")}>
        {rows.map((r) => (
          <tr key={r.transaction_id}>
            <td><Link className="text-brand underline font-mono text-xs" href={`/dashboard/transactions/${r.transaction_id}`}>{r.transaction_id}</Link></td>
            <td><Badge value={r.type === "transfer" ? "processing" : "completed"} label={t(`tx.${r.type}`)} /></td>
            <td className="capitalize">{r.provider}</td>
            <td className="whitespace-nowrap">{r.amount} {r.currency}</td>
            <td>{r.fee}</td>
            <td className="font-mono text-xs">{r.phone}</td>
            <td><Badge value={r.environment} label={t(`env.${r.environment}`)} /></td>
            <td><Badge value={r.status} label={t(`status.${r.status}`)} /></td>
            <td className="whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
