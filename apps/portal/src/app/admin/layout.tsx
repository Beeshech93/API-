import { Shell, NavItem } from "@/components/Shell";

const ITEMS: NavItem[] = [
  { href: "/admin", key: "admin.overview" },
  { href: "/admin/clients", key: "admin.clients" },
  { href: "/admin/funding", key: "admin.funding" },
  { href: "/admin/transactions", key: "nav.transactions" },
  { href: "/admin/providers", key: "admin.providers" },
  { href: "/admin/api-logs", key: "nav.apiLogs" },
  { href: "/admin/health", key: "admin.health" },
  { href: "/admin/settings", key: "nav.settings" },
  { href: "/dashboard", key: "admin.clientView" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell items={ITEMS} title="Admin" requireRole="ADMIN">
      {children}
    </Shell>
  );
}
