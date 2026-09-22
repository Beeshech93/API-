import Link from "next/link";

const NAV = [
  { href: "/docs/getting-started", label: "Getting started" },
  { href: "/docs/authentication", label: "Authentication" },
  { href: "/docs/payments", label: "Payments" },
  { href: "/docs/webhooks", label: "Webhooks" },
  { href: "/docs/errors", label: "Errors" },
  { href: "/docs/console", label: "Try it" },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-6xl mx-auto px-6 py-10 flex gap-10">
      <aside className="w-56 shrink-0">
        <nav className="space-y-1 text-sm">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="block px-3 py-1.5 rounded-lg hover:bg-slate-100">
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1 min-w-0 max-w-2xl">{children}</div>
    </div>
  );
}
