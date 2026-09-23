"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LOCALES, useLocale } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthProvider";

export function Header() {
  const { locale, setLocale, t } = useLocale();
  const { user } = useAuth();
  const pathname = usePathname();

  // The dashboard and admin panel have their own sidebar shell.
  if (pathname?.startsWith("/dashboard") || pathname?.startsWith("/admin")) return null;

  return (
    <header className="bg-white text-navy sticky top-0 z-30 border-b border-slate-200">
      <nav className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <Link href="/" className="font-bold text-lg shrink-0">
          Haiti<span className="text-brand">Pay</span>
        </Link>
        <div className="flex gap-3 sm:gap-6 text-sm items-center">
          <Link href="/docs" className="hidden sm:inline text-slate-600 hover:text-navy">{t("nav.docs")}</Link>
          <div role="group" aria-label="Language" className="flex rounded-full border border-slate-300 overflow-hidden">
            {LOCALES.map((code) => (
              <button key={code} type="button" onClick={() => setLocale(code)} aria-pressed={locale === code} className={`px-2 py-1 text-[11px] font-semibold ${locale === code ? "bg-brand text-white" : "text-slate-500 hover:text-navy"}`}>
                {code.toUpperCase()}
              </button>
            ))}
          </div>
          {user ? (
            <Link href={user.role === "ADMIN" ? "/admin" : "/dashboard"} className="bg-brand hover:bg-brand-600 text-white px-4 py-1.5 rounded-full font-semibold">{t("nav.dashboard")}</Link>
          ) : (
            <Link href="/login" className="bg-brand hover:bg-brand-600 text-white px-4 py-1.5 rounded-full font-semibold">{t("nav.signIn")}</Link>
          )}
        </div>
      </nav>
    </header>
  );
}
