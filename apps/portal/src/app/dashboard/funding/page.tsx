"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useErrorMessage, useT } from "@/lib/i18n";
import { Badge, Button, Card, ErrorNote, PageTitle, Stat, Table, TextInput } from "@/components/ui";

interface Method { method: string; automatic: boolean; min_amount: number; instructions: string }
interface Funding {
  id: string; method: string; amount: number; credited_amount: number | null; status: string;
  reference: string | null; payment_url: string | null; review_note: string | null; created_at: string;
}
interface Data { methods: Method[]; balance: { available: number; funded: number; collected: number }; fundings: Funding[] }

const fmt = (n: number) => `${new Intl.NumberFormat().format(n)} HTG`;

export default function FundingPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [data, setData] = useState<Data | null>(null);
  const [method, setMethod] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = () =>
    api<Data>("/portal/funding")
      .then((d) => {
        setData(d);
        setMethod((m) => (d.methods.some((x) => x.method === m) ? m : d.methods[0]?.method ?? ""));
      })
      .catch((e) => setError(errorMessage(e)));

  useEffect(() => {
    // The provider sends the payer back here after the hosted payment page.
    const result = new URLSearchParams(window.location.search).get("result");
    if (result === "success") setMessage(t("fund.resultSuccess"));
    if (result === "error") setError(t("fund.resultError"));
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = data?.methods.find((m) => m.method === method);

  async function submit() {
    if (!selected) return;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const body = { method, amount: Number(amount), ...(selected.automatic ? {} : { reference, note: note || undefined }) };
      const res = await api<{ funding: Funding }>("/portal/funding", { method: "POST", body });
      if (selected.automatic && res.funding.payment_url) {
        window.location.href = res.funding.payment_url;
        return;
      }
      setMessage(t("fund.sent"));
      setAmount("");
      setReference("");
      setNote("");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="text-slate-500">{error ?? t("common.loading")}</p>;
  const ready = selected && Number(amount) >= selected.min_amount && (selected.automatic || reference.trim().length >= 4);

  return (
    <div>
      <PageTitle title={t("fund.title")} subtitle={t("fund.subtitle")} />
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Stat label={t("fund.balance")} value={fmt(data.balance.available)} tone="good" />
        <Stat label={t("fund.funded")} value={fmt(data.balance.funded)} />
        <Stat label={t("fund.collected")} value={fmt(data.balance.collected)} />
      </div>

      {message && <p className="mb-4 rounded-lg bg-brand-100 text-brand-600 text-sm px-4 py-3">{message}</p>}
      <ErrorNote message={error} />

      <Card className="p-5 mb-8 max-w-2xl">
        {data.methods.length === 0 ? (
          <p className="text-sm text-slate-500">{t("fund.noMethods")}</p>
        ) : (
          <>
            <p className="text-sm text-slate-600 mb-2">{t("fund.method")}</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {data.methods.map((m) => (
                <button
                  key={m.method}
                  type="button"
                  onClick={() => setMethod(m.method)}
                  aria-pressed={method === m.method}
                  className={`px-4 py-2 rounded-full border text-sm font-medium ${method === m.method ? "bg-brand text-white border-brand" : "border-slate-300 text-slate-600 hover:border-brand"}`}
                >
                  {t(`fund.m.${m.method}`)}
                </button>
              ))}
            </div>

            {selected && (
              <div className="space-y-4">
                <p className="text-xs text-slate-500">{selected.automatic ? t("fund.autoNote") : t("fund.manualNote")}</p>
                {!selected.automatic && selected.instructions && (
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{t("fund.instructions")}</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{selected.instructions}</p>
                  </div>
                )}
                <TextInput label={`${t("fund.amount")} · ${t("fund.min")} ${selected.min_amount}`} type="number" min={selected.min_amount} value={amount} onChange={(e) => setAmount(e.target.value)} />
                {!selected.automatic && (
                  <>
                    <div>
                      <TextInput label={t("fund.reference")} value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} />
                      <p className="text-xs text-slate-500 mt-1">{t("fund.referenceHint")}</p>
                    </div>
                    <TextInput label={t("fund.note")} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
                  </>
                )}
                <Button onClick={submit} disabled={busy || !ready}>{selected.automatic ? t("fund.payMoncash") : t("fund.submitRequest")}</Button>
              </div>
            )}
          </>
        )}
      </Card>

      <h2 className="font-semibold text-navy mb-2">{t("fund.history")}</h2>
      <Table head={[t("tx.created"), t("fund.method"), t("tx.amount"), t("fund.credited"), t("common.status"), ""]} empty={t("fund.empty")}>
        {data.fundings.map((f) => (
          <tr key={f.id}>
            <td className="whitespace-nowrap">{new Date(f.created_at).toLocaleString()}</td>
            <td>{t(`fund.m.${f.method}`)}{f.reference ? <span className="block text-xs text-slate-500 font-mono">{f.reference}</span> : null}</td>
            <td className="whitespace-nowrap">{fmt(f.amount)}</td>
            <td className="whitespace-nowrap">{f.credited_amount === null ? "—" : fmt(f.credited_amount)}</td>
            <td><Badge value={f.status} label={t(`status.${f.status}`)} />{f.review_note && f.status !== "completed" ? <span className="block text-xs text-slate-500 mt-1">{f.review_note}</span> : null}</td>
            <td>{f.payment_url ? <a href={f.payment_url} className="text-brand underline">{t("fund.payNow")}</a> : null}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
