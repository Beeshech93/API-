"use client";

import Link from "next/link";
import { useState } from "react";
import { PaymentHelpers } from "./helpers";
import { callPublicApi } from "@/lib/apiClient";
import { useErrorMessage, useT } from "@/lib/i18n";
import { Button, Card, ErrorNote, Select, TextInput } from "@/components/ui";
import { SANDBOX_NUMBERS } from "../samples";

export default function ConsolePage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState("moncash");
  const [operation, setOperation] = useState<"payments" | "transfers">("payments");
  const [amount, setAmount] = useState(1000);
  const [phone, setPhone] = useState("50937123456");
  const [tx, setTx] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { newKey } = PaymentHelpers;

  const run = async (fn: () => Promise<Record<string, unknown>>) => {
    setError(null);
    setBusy(true);
    try {
      setTx(await fn());
    } catch (e) {
      setError(errorMessage(e, "auth.generic"));
    } finally {
      setBusy(false);
    }
  };

  const id = tx?.transaction_id as string | undefined;
  const testKey = apiKey.startsWith("hp_test_");

  return (
    <div className="max-w-2xl">
      <Link href="/docs" className="text-sm text-brand underline">← {t("nav.docs")}</Link>
      <h1 className="text-2xl font-bold text-navy mt-2 mb-2">{t("con.title")}</h1>
      <p className="text-slate-600 mb-6">{t("con.intro")}</p>

      <Card className="p-5 mb-6 space-y-3">
        <TextInput label={t("con.key")} value={apiKey} onChange={(e) => setApiKey(e.target.value.trim())} placeholder="hp_test_..." className="font-mono" autoComplete="off" />
        {apiKey && !testKey && <p className="text-xs text-red-600">{t("con.onlyTest")}</p>}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Select label={t("con.type")} value={operation} onChange={(e) => setOperation(e.target.value as "payments" | "transfers")}>
            <option value="payments">{t("tx.payment")}</option>
            <option value="transfers">{t("tx.transfer")}</option>
          </Select>
          <Select label={t("con.provider")} value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="moncash">MonCash</option>
            <option value="natcash">NatCash</option>
          </Select>
          <TextInput label={t("con.amount")} type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          <Select label={t("con.phone")} value={phone} onChange={(e) => setPhone(e.target.value)}>
            {SANDBOX_NUMBERS.map(([num, key]) => (<option key={num} value={num}>{num} — {t(`doc.${key}`)}</option>))}
          </Select>
        </div>
        <Button
          disabled={!testKey || busy}
          onClick={() => run(() => callPublicApi(`/${operation === "payments" ? "receive" : "send"}/${provider}/${operation}`, apiKey, { method: "POST", headers: { "Idempotency-Key": newKey() }, body: { amount, currency: "HTG", phone, reference: `console_${Date.now()}` } }))}
        >
          {t("con.create")}
        </Button>
        <ErrorNote message={error} />
      </Card>

      {tx && (
        <>
          <pre className="bg-navy text-emerald-300 rounded-xl p-4 text-sm overflow-x-auto mb-4">{JSON.stringify(tx, null, 2)}</pre>
          {id && (tx.status === "pending" || tx.status === "processing") && (
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => run(() => callPublicApi(`/sandbox/transactions/${id}/simulate`, apiKey, { method: "POST", body: { outcome: "completed" } }))}>{t("con.success")}</Button>
              <Button variant="danger" disabled={busy} onClick={() => run(() => callPublicApi(`/sandbox/transactions/${id}/simulate`, apiKey, { method: "POST", body: { outcome: "failed" } }))}>{t("con.failure")}</Button>
            </div>
          )}
          {id && <div className="mt-2"><Button variant="secondary" disabled={busy} onClick={() => run(() => callPublicApi(`/${operation === "payments" ? "receive" : "send"}/${provider}/${operation}/${id}`, apiKey))}>{t("con.refresh")}</Button></div>}
        </>
      )}
    </div>
  );
}
