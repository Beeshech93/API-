"use client";

import { useAuth } from "@/lib/AuthProvider";
import { LOCALES, LOCALE_NAMES, useLocale } from "@/lib/i18n";
import { Card, PageTitle } from "@/components/ui";

export default function SettingsPage() {
  const { user } = useAuth();
  const { locale, setLocale, t } = useLocale();
  return (
    <div>
      <PageTitle title={t("nav.settings")} />
      <Card className="p-5 mb-6">
        <h2 className="font-semibold text-navy mb-3">{t("settings.profile")}</h2>
        <dl className="text-sm grid sm:grid-cols-2 gap-3">
          <div><dt className="text-slate-500">{t("auth.name")}</dt><dd className="font-medium">{user?.name}</dd></div>
          <div><dt className="text-slate-500">{t("auth.email")}</dt><dd className="font-medium">{user?.email}</dd></div>
        </dl>
      </Card>
      <Card className="p-5">
        <h2 className="font-semibold text-navy mb-3">{t("settings.language")}</h2>
        <div className="flex flex-wrap gap-2">
          {LOCALES.map((code) => (
            <button key={code} onClick={() => setLocale(code)} aria-pressed={locale === code} className={`px-4 py-2 rounded-lg text-sm border ${locale === code ? "bg-electric text-white border-electric" : "bg-white border-slate-300 text-navy"}`}>
              {LOCALE_NAMES[code]}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
