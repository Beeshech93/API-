"use client";

import Link from "next/link";
import { API_URL } from "@/lib/apiClient";
import { useT } from "@/lib/i18n";

const SNIPPET = `curl -X POST ${API_URL}/api/v1/receive/moncash/payments \\
  -H "Authorization: Bearer hp_test_xxxxxxxx" \\
  -H "Idempotency-Key: order-12345" \\
  -H "Content-Type: application/json" \\
  -d '{ "amount": 1000, "currency": "HTG",
        "phone": "50900000001", "reference": "ORDER-12345" }'`;

export default function Landing() {
  const t = useT();
  return (
    <div className="bg-white text-slate-700">
      <section className="relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(22,163,74,0.18),transparent)]" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-16 text-center">
          <h1 className="text-4xl sm:text-6xl font-extrabold text-navy tracking-tight">{t("land.hero.title")}</h1>
          <p className="mt-6 text-lg text-slate-600 max-w-2xl mx-auto">{t("land.hero.sub")}</p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link href="/signup" className="bg-brand hover:bg-brand-600 text-white px-6 py-3 rounded-full font-semibold">{t("land.cta.start")}</Link>
            <Link href="/docs" className="border border-brand text-brand hover:bg-brand-50 px-6 py-3 rounded-full font-semibold">{t("land.cta.docs")}</Link>
          </div>
          <pre className="mt-12 mx-auto max-w-2xl text-left text-xs sm:text-sm bg-navy border border-navy rounded-2xl p-5 overflow-x-auto text-emerald-100 shadow-lg"><code>{SNIPPET}</code></pre>
        </div>
      </section>

      <Section id="how" title={t("land.how.title")}>
        <div className="grid md:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <Card key={n}>
              <span className="text-brand font-bold">0{n}</span>
              <h3 className="text-navy font-semibold mt-2">{t(`land.how.${n}t`)}</h3>
              <p className="text-sm text-slate-500 mt-1">{t(`land.how.${n}b`)}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section id="features" title={t("land.feat.title")}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <Card key={n}>
              <h3 className="text-navy font-semibold">{t(`land.feat.${n}t`)}</h3>
              <p className="text-sm text-slate-500 mt-1">{t(`land.feat.${n}b`)}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section id="providers" title="MonCash · NatCash">
        <div className="grid md:grid-cols-2 gap-4">
          <Card><h3 className="text-navy font-semibold">{t("land.moncash.title")}</h3><p className="text-sm text-slate-500 mt-1">{t("land.moncash.body")}</p></Card>
          <Card><h3 className="text-navy font-semibold">{t("land.natcash.title")}</h3><p className="text-sm text-slate-500 mt-1">{t("land.natcash.body")}</p></Card>
        </div>
      </Section>

      <Section id="security" title={t("land.security.title")}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="flex gap-3 items-start rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm"><span className="text-brand">✓</span>{t(`land.security.${n}`)}</div>
          ))}
        </div>
      </Section>

      <Section id="docs" title={t("land.docs.title")}>
        <p className="text-slate-600 max-w-2xl">{t("land.docs.body")}</p>
        <Link href="/docs" className="inline-block mt-4 bg-brand hover:bg-brand-600 text-white px-5 py-2 rounded-full font-semibold text-sm">{t("land.cta.docs")}</Link>
      </Section>

      <Section id="faq" title={t("land.faq.title")}>
        <div className="max-w-3xl space-y-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <details key={n} className="rounded-xl border border-slate-200 bg-white px-5 py-4 group shadow-sm">
              <summary className="cursor-pointer text-navy font-medium list-none flex justify-between">{t(`land.faq.${n}q`)}<span className="text-brand group-open:rotate-45 transition-transform">+</span></summary>
              <p className="text-sm text-slate-500 mt-3">{t(`land.faq.${n}a`)}</p>
            </details>
          ))}
        </div>
      </Section>

      <Section id="contact" title={t("land.contact.title")}>
        <p className="text-slate-600 max-w-2xl">{t("land.contact.body")}</p>
        <Link href="/signup" className="inline-block mt-4 border border-brand text-brand hover:bg-brand-50 px-5 py-2 rounded-full font-semibold text-sm">{t("land.cta.start")}</Link>
      </Section>

      <footer className="border-t border-slate-200 py-8 text-center text-xs text-slate-500">{t("land.footer")}</footer>
    </div>
  );
}

function Section({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="max-w-6xl mx-auto px-4 sm:px-6 py-14 scroll-mt-16">
      <h2 className="text-2xl sm:text-3xl font-bold text-navy">{title}</h2>
      {subtitle && <p className="text-slate-500 mt-2">{subtitle}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>;
}
