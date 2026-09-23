"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";

export default function DocsIndexPage() {
  const t = useT();
  return (
    <div>
      <h1 className="text-3xl font-bold text-navy mb-4">{t("docs.indexTitle")}</h1>
      <p className="text-slate-600 mb-6">{t("docs.indexBody")}</p>
      <div className="flex gap-3 flex-wrap">
        <Link href="/docs/getting-started" className="bg-navy text-white px-4 py-2 rounded-lg text-sm font-semibold">
          {t("docs.gettingStarted")}
        </Link>
        <Link href="/docs/console" className="border border-navy text-navy px-4 py-2 rounded-lg text-sm font-semibold">
          {t("docs.tryIt")}
        </Link>
      </div>
    </div>
  );
}
