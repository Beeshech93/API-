"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useErrorMessage, useT } from "@/lib/i18n";
import { Badge, Button, Card, ErrorNote, PageTitle, TextInput } from "@/components/ui";

interface Fees { percentageBps: number; fixedFee: { HTG: number; USD: number }; providerFeeBps: number; minAmount: { HTG: number; USD: number }; maxAmount: { HTG: number; USD: number } }

export default function AdminSettings() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [fees, setFees] = useState<Fees | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ fees: Fees }>("/admin/settings/fees").then((d) => setFees(d.fees)).catch((e) => setError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!fees) return <p className="text-slate-500">{error ?? t("common.loading")}</p>;
  const set = (patch: Partial<Fees>) => setFees({ ...fees, ...patch });
  const n = (v: string) => Number(v);

  async function save() {
    setError(null);
    try {
      await api("/admin/settings/fees", { method: "PUT", body: fees });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div>
      <PageTitle title={t("admin.feesTitle")} subtitle={t("admin.feesSubtitle")} />
      <Card className="p-5 max-w-2xl">
        <div className="grid sm:grid-cols-2 gap-3">
          <TextInput label={t("admin.percentageBps")} type="number" value={fees.percentageBps} onChange={(e) => set({ percentageBps: n(e.target.value) })} />
          <TextInput label={t("admin.providerBps")} type="number" value={fees.providerFeeBps} onChange={(e) => set({ providerFeeBps: n(e.target.value) })} />
          <TextInput label={`${t("admin.fixedFee")} HTG`} type="number" value={fees.fixedFee.HTG} onChange={(e) => set({ fixedFee: { ...fees.fixedFee, HTG: n(e.target.value) } })} />
          <TextInput label={`${t("admin.fixedFee")} USD`} type="number" value={fees.fixedFee.USD} onChange={(e) => set({ fixedFee: { ...fees.fixedFee, USD: n(e.target.value) } })} />
          <TextInput label="Min HTG" type="number" value={fees.minAmount.HTG} onChange={(e) => set({ minAmount: { ...fees.minAmount, HTG: n(e.target.value) } })} />
          <TextInput label="Max HTG" type="number" value={fees.maxAmount.HTG} onChange={(e) => set({ maxAmount: { ...fees.maxAmount, HTG: n(e.target.value) } })} />
          <TextInput label="Min USD" type="number" value={fees.minAmount.USD} onChange={(e) => set({ minAmount: { ...fees.minAmount, USD: n(e.target.value) } })} />
          <TextInput label="Max USD" type="number" value={fees.maxAmount.USD} onChange={(e) => set({ maxAmount: { ...fees.maxAmount, USD: n(e.target.value) } })} />
        </div>
        <p className="text-xs text-slate-500 mt-3">{t("admin.feeFormula")}</p>
        <div className="mt-4 flex items-center gap-3"><Button onClick={save}>{t("common.save")}</Button>{saved && <Badge value="active" label={t("common.saved")} />}</div>
        <ErrorNote message={error} />
      </Card>
    </div>
  );
}
