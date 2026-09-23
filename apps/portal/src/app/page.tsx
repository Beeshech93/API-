"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";

export default function HomePage() {
  const t = useT();
  return (
    <div className="max-w-6xl mx-auto px-6 py-24 text-center">
      <h1 className="text-5xl font-extrabold text-navy mb-6">{t("home.title")}</h1>
      <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-10">{t("home.body")}</p>
      <div className="flex gap-4 justify-center flex-wrap">
        <Link href="/signup" className="bg-navy text-white px-6 py-3 rounded-full font-semibold">
          {t("home.cta1")}
        </Link>
        <Link href="/docs" className="border border-navy text-navy px-6 py-3 rounded-full font-semibold">
          {t("home.cta2")}
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24 text-left">
        <Feature title={t("home.f1t")} body={t("home.f1b")} />
        <Feature title={t("home.f2t")} body={t("home.f2b")} />
        <Feature title={t("home.f3t")} body={t("home.f3b")} />
      </div>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
      <h3 className="font-semibold text-navy mb-2">{title}</h3>
      <p className="text-slate-600 text-sm">{body}</p>
    </div>
  );
}
