"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";

const NAV = [
  { href: "/docs/getting-started", key: "docs.gettingStarted" },
  { href: "/docs/authentication", key: "docs.authentication" },
  { href: "/docs/payments", key: "docs.payments" },
  { href: "/docs/webhooks", key: "docs.webhooks" },
  { href: "/docs/errors", key: "docs.errors" },
  { href: "/docs/console", key: "docs.tryIt" },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row gap-6 sm:gap-10">
      <aside className="sm:w-56 shrink-0">
        <nav className="flex sm:flex-col flex-wrap gap-1 text-sm">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="block px-3 py-1.5 rounded-lg hover:bg-slate-100">
              {t(item.key)}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1 min-w-0 max-w-2xl">{children}</div>
    </div>
  );
}
