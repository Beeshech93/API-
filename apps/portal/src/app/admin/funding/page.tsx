"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useErrorMessage, useT } from "@/lib/i18n";
import { Badge, Button, Card, ErrorNote, PageTitle, Select, Table, TextArea, TextInput } from "@/components/ui";

interface Row {
  id: string; client_id: string; client_name: string; method: string; amount: number; credited_amount: number | null;
  status: string; reference: string | null; note: string | null; review_note: string | null; requested_at: string;
}
interface MethodCfg { enabled: boolean; minAmount: number; instructions: string }
type Cfg = Record<string, MethodCfg>;

const METHODS = ["MONCASH", "NATCASH", "ZELLE", "BANK_DEPOSIT", "BANK_TRANSFER", "CRYPTO_USDT"];
const fmt = (n: number) => `${new Intl.NumberFormat().format(n)} HTG`;

export default function AdminFunding() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [active, setActive] = useState<{ id: string; mode: "approve" | "reject" } | null>(null);
  const [credit, setCredit] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRows = () => api<{ fundings: Row[] }>(`/admin/funding${status ? `?status=${status}` : ""}`).then((d) => setRows(d.fundings)).catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  useEffect(() => {
    api<{ methods: Cfg }>("/admin/settings/funding").then((d) => setCfg(d.methods)).catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function decide() {
    if (!active) return;
    setError(null);
    try {
      const body = active.mode === "approve" ? { amount: credit ? Number(credit) : undefined, note: note || undefined } : { note };
      await api(`/admin/funding/${active.id}/${active.mode}`, { method: "POST", body });
      setActive(null);
      setCredit("");
      setNote("");
      await loadRows();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function saveCfg() {
    setError(null);
    try {
      await api("/admin/settings/funding", { method: "PUT", body: cfg });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const patch = (m: string, p: Partial<MethodCfg>) => cfg && setCfg({ ...cfg, [m]: { ...cfg[m], ...p } });

  return (
    <div>
      <PageTitle title={t("admin.fund.title")} subtitle={t("admin.fund.subtitle")} />
      <ErrorNote message={error} />
      <div className="max-w-xs mb-4">
        <Select label={t("common.status")} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">{t("status.pending")}</option>
          <option value="completed">{t("status.completed")}</option>
          <option value="rejected">{t("status.rejected")}</option>
          <option value="failed">{t("status.failed")}</option>
          <option value="">{t("common.all")}</option>
        </Select>
      </div>
      <Table head={[t("tx.created"), t("admin.fund.client"), t("fund.method"), t("tx.amount"), t("fund.reference"), t("common.status"), ""]} empty={t("admin.fund.empty")}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="whitespace-nowrap">{new Date(r.requested_at).toLocaleString()}</td>
            <td>{r.client_name}</td>
            <td>{t(`fund.m.${r.method}`)}</td>
            <td className="whitespace-nowrap">{fmt(r.amount)}{r.credited_amount !== null && r.credited_amount !== r.amount ? <span className="block text-xs text-slate-500">{t("fund.credited")}: {fmt(r.credited_amount)}</span> : null}</td>
            <td className="font-mono text-xs">{r.reference ?? "—"}{r.note ? <span className="block font-sans text-slate-500">{r.note}</span> : null}</td>
            <td><Badge value={r.status} label={t(`status.${r.status}`)} />{r.review_note ? <span className="block text-xs text-slate-500 mt-1">{r.review_note}</span> : null}</td>
            <td className="whitespace-nowrap">
              {r.status === "pending" && r.method !== "moncash" && (
                <div className="flex gap-2">
                  <Button onClick={() => { setActive({ id: r.id, mode: "approve" }); setCredit(String(r.amount)); setNote(""); }}>{t("admin.fund.approve")}</Button>
                  <Button variant="danger" onClick={() => { setActive({ id: r.id, mode: "reject" }); setNote(""); }}>{t("admin.fund.reject")}</Button>
                </div>
              )}
              {r.status === "pending" && r.method === "moncash" && <span className="text-xs text-slate-500">{t("admin.fund.auto")}</span>}
            </td>
          </tr>
        ))}
      </Table>

      {active && (
        <Card className="p-5 mt-4 max-w-xl">
          <h3 className="font-semibold text-navy mb-3">{active.mode === "approve" ? t("admin.fund.approve") : t("admin.fund.reject")}</h3>
          <div className="space-y-3">
            {active.mode === "approve" && <TextInput label={t("admin.fund.creditAmount")} type="number" value={credit} onChange={(e) => setCredit(e.target.value)} />}
            <TextInput label={active.mode === "approve" ? t("fund.note") : t("admin.fund.rejectReason")} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex gap-2">
              <Button variant={active.mode === "approve" ? "primary" : "danger"} onClick={decide} disabled={active.mode === "reject" && note.trim().length < 3}>{active.mode === "approve" ? t("admin.fund.approve") : t("admin.fund.reject")}</Button>
              <Button variant="secondary" onClick={() => setActive(null)}>{t("common.cancel")}</Button>
            </div>
          </div>
        </Card>
      )}

      <h2 className="text-lg font-bold text-navy mt-10 mb-1">{t("admin.fund.methodsTitle")}</h2>
      <p className="text-sm text-slate-500 mb-4 max-w-2xl">{t("admin.fund.methodsSub")}</p>
      {cfg && (
        <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
          {METHODS.map((m) => (
            <Card key={m} className="p-5">
              <label className="flex items-center justify-between gap-3">
                <span className="font-semibold text-navy">{t(`fund.m.${m.toLowerCase()}`)}{m === "MONCASH" ? <span className="ml-2 text-xs font-normal text-slate-500">{t("admin.fund.auto")}</span> : null}</span>
                <span className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={cfg[m].enabled} onChange={(e) => patch(m, { enabled: e.target.checked })} />
                  {t("admin.fund.enabled")}
                </span>
              </label>
              <div className="mt-3 space-y-3">
                <TextInput label={t("admin.fund.min")} type="number" min={1} value={cfg[m].minAmount} onChange={(e) => patch(m, { minAmount: Number(e.target.value) })} />
                {m !== "MONCASH" && <TextArea label={t("admin.fund.instr")} rows={4} maxLength={2000} value={cfg[m].instructions} onChange={(e) => patch(m, { instructions: e.target.value })} />}
              </div>
            </Card>
          ))}
        </div>
      )}
      <div className="mt-4 flex items-center gap-3"><Button onClick={saveCfg} disabled={!cfg}>{t("common.save")}</Button>{saved && <Badge value="active" label={t("common.saved")} />}</div>
    </div>
  );
}
