import { Shell, NavItem } from "@/components/Shell";

const ITEMS: NavItem[] = [
  { href: "/dashboard", key: "nav.dashboard" },
  { href: "/dashboard/kyc", key: "nav.kyc" },
  { href: "/dashboard/funding", key: "nav.funding" },
  { href: "/dashboard/api-keys", key: "nav.apiKeys" },
  { href: "/dashboard/transactions", key: "nav.transactions" },
  { href: "/dashboard/webhooks", key: "nav.webhooks" },
  { href: "/dashboard/api-logs", key: "nav.apiLogs" },
  { href: "/docs", key: "nav.docs" },
  { href: "/dashboard/usage", key: "nav.usage" },
  { href: "/dashboard/settings", key: "nav.settings" },
  { href: "/dashboard/support", key: "nav.support" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell items={ITEMS} title="Dashboard">
      {children}
    </Shell>
  );
}
