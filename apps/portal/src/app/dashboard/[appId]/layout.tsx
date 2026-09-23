"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n";

const TABS = ["keys", "providers", "transactions", "webhooks", "billing"];

export default function ApplicationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { appId: string };
}) {
  const pathname = usePathname();
  const t = useT();

  return (
    <div>
      <nav className="flex gap-1 border-b border-slate-200 mb-6">
        {TABS.map((tab) => {
          const href = `/dashboard/${params.appId}/${tab}`;
          const active = pathname === href;
          return (
            <Link
              key={tab}
              href={href}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                active ? "border-lime text-navy" : "border-transparent text-slate-500 hover:text-navy"
              }`}
            >
              {t(`tab.${tab}`)}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
