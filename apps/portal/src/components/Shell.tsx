"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthProvider";
import { LOCALES, Locale, useLocale } from "@/lib/i18n";

export interface NavItem {
  href: string;
  key: string;
  external?: boolean;
}

// Sidebar layout shared by the client dashboard and the admin panel.
export function Shell({ items, title, requireRole, children }: { items: NavItem[]; title: string; requireRole?: "ADMIN"; children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const { locale, setLocale, t } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!loading && user && requireRole && user.role !== requireRole) router.replace("/dashboard");
  }, [loading, user, requireRole, router]);

  useEffect(() => setOpen(false), [pathname]);

  if (loading || !user || (requireRole && user.role !== requireRole)) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">{t("common.loading")}</div>;
  }

  const nav = (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = item.href === pathname || (item.href !== "/dashboard" && item.href !== "/admin" && pathname?.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-2 rounded-lg text-sm ${active ? "bg-electric text-white font-semibold" : "text-slate-300 hover:bg-navy-700 hover:text-white"}`}
          >
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen md:flex">
      <header className="md:hidden bg-navy text-white flex items-center justify-between px-4 py-3">
        <Link href="/" className="font-bold">
          Haiti<span className="text-electric">Pay</span>
        </Link>
        <button onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open} className="px-3 py-1 border border-white/30 rounded-lg text-sm">
          {open ? "×" : "☰"}
        </button>
      </header>
      <aside className={`${open ? "block" : "hidden"} md:flex md:flex-col md:w-64 md:min-h-screen bg-navy text-white p-4 gap-6 md:sticky md:top-0 md:h-screen md:overflow-y-auto`}>
        <div className="hidden md:block">
          <Link href="/" className="font-bold text-xl">
            Haiti<span className="text-electric">Pay</span>
          </Link>
          <p className="text-xs text-slate-400 mt-1">{title}</p>
        </div>
        {nav}
        <div className="mt-auto space-y-3 pt-4 border-t border-white/10">
          <div role="group" aria-label="Language" className="flex rounded-lg border border-white/20 overflow-hidden text-xs">
            {LOCALES.map((code: Locale) => (
              <button
                key={code}
                type="button"
                onClick={() => setLocale(code)}
                aria-pressed={locale === code}
                className={`flex-1 py-1.5 font-semibold ${locale === code ? "bg-electric text-white" : "text-slate-300 hover:text-white"}`}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 truncate" title={user.email}>{user.email}</p>
          <button onClick={logout} className="text-sm text-slate-300 hover:text-white underline">
            {t("nav.signOut")}
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-4 md:p-8 max-w-6xl">{children}</main>
    </div>
  );
}
