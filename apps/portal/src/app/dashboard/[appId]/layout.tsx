"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { slug: "keys", label: "API Keys" },
  { slug: "providers", label: "Providers" },
  { slug: "transactions", label: "Transactions" },
  { slug: "webhooks", label: "Webhooks" },
  { slug: "billing", label: "Billing" },
];

export default function ApplicationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { appId: string };
}) {
  const pathname = usePathname();

  return (
    <div>
      <nav className="flex gap-1 border-b border-slate-200 mb-6">
        {TABS.map((tab) => {
          const href = `/dashboard/${params.appId}/${tab.slug}`;
          const active = pathname === href;
          return (
            <Link
              key={tab.slug}
              href={href}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                active ? "border-lime text-navy" : "border-transparent text-slate-500 hover:text-navy"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
