"use client";

import Link from "next/link";
import { LOCALES, Locale, useLocale } from "@/lib/i18n";

const LABELS: Record<Locale, string> = { en: "EN", es: "ES", fr: "FR" };

export function Header() {
  const { locale, setLocale, t } = useLocale();

  return (
    <header className="bg-navy text-white">
      <nav className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg">
          Ayiti<span className="text-lime">Pay</span>
        </Link>
        <div className="flex gap-4 sm:gap-6 text-sm items-center">
          <Link href="/docs">{t("nav.docs")}</Link>
          <Link href="/dashboard">{t("nav.dashboard")}</Link>
          <div role="group" aria-label="Language" className="flex rounded-full border border-white/30 overflow-hidden">
            {LOCALES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLocale(code)}
                aria-pressed={locale === code}
                className={`px-2.5 py-1 text-xs font-semibold ${
                  locale === code ? "bg-lime text-navy" : "text-white/80 hover:text-white"
                }`}
              >
                {LABELS[code]}
              </button>
            ))}
          </div>
          <Link href="/login" className="bg-lime text-navy px-4 py-1.5 rounded-full font-semibold">
            {t("nav.signIn")}
          </Link>
        </div>
      </nav>
    </header>
  );
}
