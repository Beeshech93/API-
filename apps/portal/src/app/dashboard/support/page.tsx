"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";
import { Card, PageTitle } from "@/components/ui";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

export default function SupportPage() {
  const t = useT();
  return (
    <div>
      <PageTitle title={t("nav.support")} subtitle={t("support.subtitle")} />
      <Card className="p-5 space-y-3 text-sm">
        <p>{t("support.tip")}</p>
        <p><Link href="/docs" className="text-brand underline">{t("nav.docs")}</Link></p>
        {SUPPORT_EMAIL ? <p>{t("support.email")}: <a className="text-brand underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p> : <p className="text-slate-500">{t("support.noEmail")}</p>}
      </Card>
    </div>
  );
}
