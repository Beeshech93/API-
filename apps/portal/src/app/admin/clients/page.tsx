"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useErrorMessage, useT } from "@/lib/i18n";
import { Badge, Button, Card, ErrorNote, PageTitle, Table, TextInput } from "@/components/ui";

interface Row { id: string; name: string; status: string; users: { email: string }[]; plan: string | null; subscription_status: string; subscription_end: string | null }

export default function ClientsPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", plan_code: "" });
  const [error, setError] = useState<string | null>(null);

  const load = () => api<{ clients: Row[] }>(`/admin/clients?search=${encodeURIComponent(search)}`).then((d) => setRows(d.clients)).catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function create() {
    setError(null);
    try {
      await api("/admin/clients", { method: "POST", body: { ...form, plan_code: form.plan_code || undefined } });
      setForm({ name: "", email: "", password: "", plan_code: "" });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div>
      <PageTitle title={t("admin.clients")} />
      <Card className="p-5 mb-6">
        <h2 className="font-semibold text-navy mb-3">{t("admin.createClient")}</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <TextInput label={t("auth.name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextInput label={t("auth.email")} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <TextInput label={t("auth.password")} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <TextInput label={t("overview.plan")} placeholder="STARTER" value={form.plan_code} onChange={(e) => setForm({ ...form, plan_code: e.target.value })} />
        </div>
        <div className="mt-3"><Button onClick={create} disabled={!form.name || !form.email || form.password.length < 10}>{t("admin.createClient")}</Button></div>
        <ErrorNote message={error} />
      </Card>
      <div className="max-w-sm mb-4"><TextInput label={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <Table head={[t("auth.name"), t("auth.email"), t("overview.plan"), t("billing.subscription"), t("common.status"), ""]} empty={t("common.empty")}>
        {rows.map((c) => (
          <tr key={c.id}>
            <td className="font-medium">{c.name}</td>
            <td>{c.users.map((u) => u.email).join(", ")}</td>
            <td>{c.plan ?? "—"}</td>
            <td><Badge value={c.subscription_status} label={t(`status.${c.subscription_status}`)} /></td>
            <td><Badge value={c.status} label={t(`status.${c.status}`)} /></td>
            <td><Link href={`/admin/clients/${c.id}`} className="text-brand underline">{t("common.view")}</Link></td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
