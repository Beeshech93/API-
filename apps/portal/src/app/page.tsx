"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { API_URL } from "@/lib/apiClient";
import { useT } from "@/lib/i18n";

interface Plan { code: string; name: string; price: number | null; monthly_request_limit: number | null; max_api_keys: number | null; rate_limit_per_minute: number | null; features: string[] }

const SNIPPET = `curl -X POST ${API_URL}/api/v1/moncash/payments \\
  -H "Authorization: Bearer hp_test_xxxxxxxx" \\
  -H "Idempotency-Key: order-12345" \\
  -H "Content-Type: application/json" \\
  -d '{ "amount": 1000, "currency": "HTG",
        "phone": "50900000001", "reference": "ORDER-12345" }'`;

export default function Landing() {
  const t = useT();
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/plans`).then((r) => r.json()).then((d) => setPlans(d.plans ?? [])).catch(() => {});
  }, []);

  return (
    <div className="bg-ink text-slate-200">
      <section className="relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(47,107,255,0.35),transparent)]" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-16 text-center">
          <h1 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight">{t("land.hero.title")}</h1>
          <p className="mt-6 text-lg text-slate-300 max-w-2xl mx-auto">{t("land.hero.sub")}</p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link href="/signup" className="bg-electric hover:bg-electric-600 text-white px-6 py-3 rounded-full font-semibold">{t("land.cta.start")}</Link>
            <Link href="/docs" className="border border-white/30 hover:bg-white/10 text-white px-6 py-3 rounded-full font-semibold">{t("land.cta.docs")}</Link>
            <Link href="/#plans" className="border border-white/30 hover:bg-white/10 text-white px-6 py-3 rounded-full font-semibold">{t("land.cta.plans")}</Link>
          </div>
          <pre className="mt-12 mx-auto max-w-2xl text-left text-xs sm:text-sm bg-navy border border-white/10 rounded-2xl p-5 overflow-x-auto text-slate-200"><code>{SNIPPET}</code></pre>
        </div>
      </section>

      <Section id="how" title={t("land.how.title")}>
        <div className="grid md:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <Card key={n}>
              <span className="text-electric font-bold">0{n}</span>
              <h3 className="text-white font-semibold mt-2">{t(`land.how.${n}t`)}</h3>
              <p className="text-sm text-slate-400 mt-1">{t(`land.how.${n}b`)}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section id="features" title={t("land.feat.title")}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <Card key={n}>
              <h3 className="text-white font-semibold">{t(`land.feat.${n}t`)}</h3>
              <p className="text-sm text-slate-400 mt-1">{t(`land.feat.${n}b`)}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section id="providers" title="MonCash · NatCash · Bazik">
        <div className="grid md:grid-cols-3 gap-4">
          <Card><h3 className="text-white font-semibold">{t("land.moncash.title")}</h3><p className="text-sm text-slate-400 mt-1">{t("land.moncash.body")}</p></Card>
          <Card><h3 className="text-white font-semibold">{t("land.natcash.title")}</h3><p className="text-sm text-slate-400 mt-1">{t("land.natcash.body")}</p></Card>
          <Card><h3 className="text-white font-semibold">{t("land.bazik.title")}</h3><p className="text-sm text-slate-400 mt-1">{t("land.bazik.body")}</p></Card>
        </div>
      </Section>

      <Section id="plans" title={t("land.plans.title")} subtitle={t("land.plans.sub")}>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
          {plans.map((p) => (
            <div key={p.code} className={`rounded-2xl p-6 flex flex-col border ${p.code === "BUSINESS" ? "border-electric bg-navy-800" : "border-white/10 bg-navy"}`}>
              <h3 className="text-white font-bold text-lg">{p.name}</h3>
              <p className="text-3xl font-extrabold text-white mt-2">{p.price === null ? t("plans.custom") : `$${p.price}`}{p.price !== null && <span className="text-sm font-normal text-slate-400"> / {t("plans.month")}</span>}</p>
              <ul className="mt-4 space-y-1.5 text-sm text-slate-300 flex-1">
                <li>{p.monthly_request_limit === null ? t("plans.customVolume") : `${new Intl.NumberFormat().format(p.monthly_request_limit)} ${t("plans.requestsMonth")}`}</li>
                <li>{p.max_api_keys === null ? t("plans.customKeys") : `${p.max_api_keys} ${t("plans.keys")}`}</li>
                {p.features.map((f) => <li key={f}>✓ {t(`feature.${f}`)}</li>)}
              </ul>
              <Link href={p.price === null ? "/signup" : "/signup"} className="mt-5 text-center bg-electric hover:bg-electric-600 text-white rounded-full py-2 font-semibold text-sm">{p.price === null ? t("billing.contactSales") : t("land.cta.start")}</Link>
            </div>
          ))}
        </div>
      </Section>

      <Section id="security" title={t("land.security.title")}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="flex gap-3 items-start rounded-xl border border-white/10 bg-navy px-4 py-3 text-sm"><span className="text-electric">✓</span>{t(`land.security.${n}`)}</div>
          ))}
        </div>
      </Section>

      <Section id="docs" title={t("land.docs.title")}>
        <p className="text-slate-300 max-w-2xl">{t("land.docs.body")}</p>
        <Link href="/docs" className="inline-block mt-4 bg-electric hover:bg-electric-600 text-white px-5 py-2 rounded-full font-semibold text-sm">{t("land.cta.docs")}</Link>
      </Section>

      <Section id="faq" title={t("land.faq.title")}>
        <div className="max-w-3xl space-y-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <details key={n} className="rounded-xl border border-white/10 bg-navy px-5 py-4 group">
              <summary className="cursor-pointer text-white font-medium list-none flex justify-between">{t(`land.faq.${n}q`)}<span className="text-electric group-open:rotate-45 transition-transform">+</span></summary>
              <p className="text-sm text-slate-400 mt-3">{t(`land.faq.${n}a`)}</p>
            </details>
          ))}
        </div>
      </Section>

      <Section id="contact" title={t("land.contact.title")}>
        <p className="text-slate-300 max-w-2xl">{t("land.contact.body")}</p>
        <Link href="/signup" className="inline-block mt-4 border border-white/30 hover:bg-white/10 text-white px-5 py-2 rounded-full font-semibold text-sm">{t("land.cta.start")}</Link>
      </Section>

      <footer className="border-t border-white/10 py-8 text-center text-xs text-slate-500">{t("land.footer")}</footer>
    </div>
  );
}

function Section({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="max-w-6xl mx-auto px-4 sm:px-6 py-14 scroll-mt-16">
      <h2 className="text-2xl sm:text-3xl font-bold text-white">{title}</h2>
      {subtitle && <p className="text-slate-400 mt-2">{subtitle}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-white/10 bg-navy p-6">{children}</div>;
}
