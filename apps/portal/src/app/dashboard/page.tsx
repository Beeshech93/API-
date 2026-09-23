"use client";

import { useT } from "@/lib/i18n";

export default function DashboardIndexPage() {
  const t = useT();
  return (
    <div className="text-slate-600">
      <h1 className="text-2xl font-bold text-navy mb-2">{t("dash.welcome")}</h1>
      <p>{t("dash.welcomeBody")}</p>
    </div>
  );
}
