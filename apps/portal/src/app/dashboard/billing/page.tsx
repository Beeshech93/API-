"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useErrorMessage, useT } from "@/lib/i18n";
import { Badge, Button, Card, ErrorNote, PageTitle, ProgressBar, Table } from "@/components/ui";

interface Plan { code: string; name: string; price: number | null; currency: string; monthly_request_limit: number | null; max_api_keys: number | null; rate_limit_per_minute: number | null; features: string[] }
interface Billing {
  plan: Plan | null;
  subscription: { status: string; start: string; end: string; monthly_request_limit: number | null; monthly_requests_used: number } | null;
  live_access: boolean;
  invoices: { id: string; amount: number; currency: string; status: string; period_start: string; period_end: string; paid_at: string | null }[];
  plans: Plan[];
}

export default function BillingPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [data, setData] = useState<Billing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api<Billing>("/portal/billing").then(setData).catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (!data) return <p className="text-slate-500">{error ?? t("common.loading")}</p>;
  const current = data.plan?.code;
  const order = data.plans.map((p) => p.code);

  return (
    <div>
      <PageTitle title={t("nav.billing")} subtitle={t("billing.subtitle")} />
      <ErrorNote message={error} />

      <Card className="p-5 mb-6">
        {data.plan && data.subscription ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div><p className="text-slate-500">{t("overview.plan")}</p><p className="text-xl font-bold text-navy">{data.plan.name}</p></div>
            <div><p className="text-slate-500">{t("billing.price")}</p><p className="text-xl font-bold text-navy">{data.plan.price === null ? t("plans.custom") : `$${data.plan.price}/${t("plans.month")}`}</p></div>
            <div><p className="text-slate-500">{t("common.status")}</p><Badge value={data.subscription.status} label={t(`status.${data.subscription.status}`)} /></div>
            <div><p className="text-slate-500">{data.subscription.status === "trial" ? t("billing.trialEnds") : t("billing.nextPayment")}</p><p className="font-semibold text-navy">{new Date(data.subscription.end).toLocaleDateString()}</p></div>
            <div className="sm:col-span-2 lg:col-span-4">
              <div className="flex justify-between mb-1"><span className="text-slate-500">{t("overview.requests")}</span><span>{data.subscription.monthly_requests_used} / {data.subscription.monthly_request_limit ?? "∞"}</span></div>
              <ProgressBar value={data.subscription.monthly_requests_used} max={data.subscription.monthly_request_limit} />
            </div>
          </div>
        ) : (
          <p className="text-slate-600">{t("overview.noPlanBody")}</p>
        )}
        {data.subscription?.status === "trial" && <p className="text-xs text-slate-500 mt-4">{t("billing.trialNote")}</p>}
        {data.subscription && data.subscription.status !== "cancelled" && (
          <div className="mt-4"><Button variant="danger" onClick={() => confirm(t("billing.confirmCancel")) && act(() => api("/portal/billing/cancel", { method: "POST" }))}>{t("billing.cancel")}</Button></div>
        )}
      </Card>

      <h2 className="font-semibold text-navy mb-3">{t("billing.plans")}</h2>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {data.plans.map((p) => {
          const isCurrent = p.code === current;
          const label = !current ? t("billing.select") : order.indexOf(p.code) > order.indexOf(current) ? t("billing.upgrade") : t("billing.downgrade");
          return (
            <Card key={p.code} className={`p-5 flex flex-col ${isCurrent ? "ring-2 ring-electric" : ""}`}>
              <h3 className="font-bold text-navy">{p.name}</h3>
              <p className="text-2xl font-bold mt-2">{p.price === null ? t("plans.custom") : `$${p.price}`}{p.price !== null && <span className="text-sm font-normal text-slate-500">/{t("plans.month")}</span>}</p>
              <ul className="text-sm text-slate-600 mt-3 space-y-1 flex-1">
                <li>{p.monthly_request_limit === null ? t("plans.customVolume") : `${new Intl.NumberFormat().format(p.monthly_request_limit)} ${t("plans.requestsMonth")}`}</li>
                <li>{p.max_api_keys === null ? t("plans.customKeys") : `${p.max_api_keys} ${t("plans.keys")}`}</li>
                {p.rate_limit_per_minute && <li>{p.rate_limit_per_minute} {t("plans.perMinute")}</li>}
                {p.features.map((f) => <li key={f}>✓ {t(`feature.${f}`)}</li>)}
              </ul>
              <div className="mt-4">
                {isCurrent ? <Badge value="active" label={t("billing.current")} /> : p.price === null ? <span className="text-sm text-slate-500">{t("billing.contactSales")}</span> : <Button onClick={() => act(() => api("/portal/billing/plan", { method: "POST", body: { plan_code: p.code } }))}>{label}</Button>}
              </div>
            </Card>
          );
        })}
      </div>

      <h2 className="font-semibold text-navy mb-3">{t("billing.history")}</h2>
      <Table head={[t("usage.period"), t("tx.amount"), t("common.status"), t("billing.paidOn")]} empty={t("billing.noInvoices")}>
        {data.invoices.map((i) => (
          <tr key={i.id}>
            <td>{new Date(i.period_start).toLocaleDateString()} → {new Date(i.period_end).toLocaleDateString()}</td>
            <td>{i.amount} {i.currency}</td>
            <td><Badge value={i.status} label={t(`status.${i.status}`)} /></td>
            <td>{i.paid_at ? new Date(i.paid_at).toLocaleDateString() : "—"}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
