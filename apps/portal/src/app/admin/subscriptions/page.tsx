"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useErrorMessage, useT } from "@/lib/i18n";
import { Badge, Button, Card, ErrorNote, PageTitle, TextInput } from "@/components/ui";

interface Plan { id: string; code: string; name: string; price: number | null; monthly_request_limit: number | null; max_api_keys: number | null; rate_limit_per_minute: number | null; transaction_fee_bps: number | null; features: string[]; active: boolean }

const num = (v: string) => (v.trim() === "" ? null : Number(v));

export default function PlansAdmin() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = () => api<{ plans: Plan[] }>("/admin/plans").then((d) => setPlans(d.plans)).catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const edit = (code: string, patch: Partial<Plan>) => setPlans((cur) => cur.map((p) => (p.code === code ? { ...p, ...patch } : p)));

  async function save(p: Plan) {
    setError(null);
    try {
      await api(`/admin/plans/${p.id}`, { method: "PATCH", body: { name: p.name, price: p.price, monthly_request_limit: p.monthly_request_limit, max_api_keys: p.max_api_keys, rate_limit_per_minute: p.rate_limit_per_minute, transaction_fee_bps: p.transaction_fee_bps, features: p.features, active: p.active } });
      setSaved(p.code);
      setTimeout(() => setSaved(null), 1500);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div>
      <PageTitle title={t("admin.subscriptions")} subtitle={t("admin.plansSubtitle")} />
      <ErrorNote message={error} />
      <div className="grid xl:grid-cols-2 gap-4">
        {plans.map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-bold text-navy">{p.code}</h2>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.active} onChange={(e) => edit(p.code, { active: e.target.checked })} />{t("status.active")}</label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextInput label={t("auth.name")} value={p.name} onChange={(e) => edit(p.code, { name: e.target.value })} />
              <TextInput label={`${t("billing.price")} (USD, ${t("admin.emptyCustom")})`} type="number" value={p.price ?? ""} onChange={(e) => edit(p.code, { price: num(e.target.value) })} />
              <TextInput label={t("admin.requestLimit")} type="number" value={p.monthly_request_limit ?? ""} onChange={(e) => edit(p.code, { monthly_request_limit: num(e.target.value) })} />
              <TextInput label={t("admin.maxKeys")} type="number" value={p.max_api_keys ?? ""} onChange={(e) => edit(p.code, { max_api_keys: num(e.target.value) })} />
              <TextInput label={t("admin.rateLimit")} type="number" value={p.rate_limit_per_minute ?? ""} onChange={(e) => edit(p.code, { rate_limit_per_minute: num(e.target.value) })} />
              <TextInput label={t("admin.feeOverride")} type="number" value={p.transaction_fee_bps ?? ""} onChange={(e) => edit(p.code, { transaction_fee_bps: num(e.target.value) })} />
            </div>
            <TextInput label={t("admin.features")} value={p.features.join(", ")} onChange={(e) => edit(p.code, { features: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
            <div className="mt-3 flex items-center gap-3"><Button onClick={() => save(p)}>{t("common.save")}</Button>{saved === p.code && <Badge value="active" label={t("common.saved")} />}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
