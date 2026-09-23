"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useErrorMessage, useT } from "@/lib/i18n";
import { Badge, Button, Card, CopyButton, ErrorNote, PageTitle, Table, TextInput } from "@/components/ui";

interface Hook { id: string; url: string; events: string[]; active: boolean; created_at: string }
interface Delivery { id: string; event: string; transaction_id: string; status: string; attempts: number; response_status: number | null; created_at: string }

export default function WebhooksPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [allEvents, setAllEvents] = useState<string[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [h, d] = await Promise.all([
        api<{ webhooks: Hook[]; events: string[] }>("/portal/webhooks"),
        api<{ deliveries: Delivery[] }>("/portal/webhook-deliveries"),
      ]);
      setHooks(h.webhooks.filter((x) => x.active));
      setAllEvents(h.events);
      setDeliveries(d.deliveries);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wrap = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const create = () =>
    wrap(async () => {
      const created = await api<{ secret: string }>("/portal/webhooks", { method: "POST", body: { url, events: events.length ? events : undefined } });
      setSecret(created.secret);
      setUrl("");
      setEvents([]);
    });

  return (
    <div>
      <PageTitle title={t("nav.webhooks")} subtitle={t("wh.subtitle")} />

      {secret && (
        <Card className="p-5 mb-6 border-amber-300 bg-amber-50">
          <p className="text-sm font-semibold text-amber-800">{t("wh.secretOnce")}</p>
          <code className="block mt-2 bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm break-all">{secret}</code>
          <div className="flex gap-2 mt-3">
            <CopyButton text={secret} label={t("common.copy")} doneLabel={t("common.copied")} />
            <Button variant="ghost" onClick={() => setSecret(null)}>{t("common.dismiss")}</Button>
          </div>
        </Card>
      )}

      <Card className="p-5 mb-6">
        <h2 className="font-semibold text-navy mb-3">{t("wh.add")}</h2>
        <TextInput label="URL" type="url" placeholder="https://client.com/webhooks/haitipay" value={url} onChange={(e) => setUrl(e.target.value)} />
        <fieldset className="mt-4">
          <legend className="text-sm text-slate-600 mb-2">{t("wh.events")} <span className="text-slate-400">({t("wh.allIfNone")})</span></legend>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {allEvents.map((ev) => (
              <label key={ev} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={events.includes(ev)} onChange={() => setEvents((cur) => (cur.includes(ev) ? cur.filter((x) => x !== ev) : [...cur, ev]))} />
                <code className="text-xs">{ev}</code>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-4"><Button onClick={create} disabled={!url.trim()}>{t("wh.add")}</Button></div>
        <ErrorNote message={error} />
      </Card>

      <h2 className="font-semibold text-navy mb-2">{t("wh.endpoints")}</h2>
      <Table head={["URL", t("wh.events"), ""]} empty={t("wh.none")}>
        {hooks.map((h) => (
          <tr key={h.id}>
            <td className="font-mono text-xs break-all">{h.url}</td>
            <td className="text-xs text-slate-500">{h.events.length === 7 ? t("common.all") : h.events.join(", ")}</td>
            <td>
              <div className="flex gap-2 justify-end">
                <Button variant="secondary" onClick={() => wrap(async () => setSecret((await api<{ secret: string }>(`/portal/webhooks/${h.id}/rotate-secret`, { method: "POST" })).secret))}>{t("wh.rotate")}</Button>
                <Button variant="danger" onClick={() => wrap(() => api(`/portal/webhooks/${h.id}`, { method: "DELETE" }))}>{t("wh.remove")}</Button>
              </div>
            </td>
          </tr>
        ))}
      </Table>

      <h2 className="font-semibold text-navy mt-8 mb-2">{t("wh.deliveries")}</h2>
      <Table head={[t("wh.event"), t("tx.id"), t("common.status"), t("wh.attempts"), t("wh.response"), t("tx.created"), ""]} empty={t("wh.noDeliveries")}>
        {deliveries.map((d) => (
          <tr key={d.id}>
            <td><code className="text-xs">{d.event}</code></td>
            <td className="font-mono text-xs">{d.transaction_id}</td>
            <td><Badge value={d.status} label={t(`status.${d.status}`)} /></td>
            <td>{d.attempts}</td>
            <td>{d.response_status ?? "—"}</td>
            <td className="whitespace-nowrap">{new Date(d.created_at).toLocaleString()}</td>
            <td><Button variant="ghost" onClick={() => wrap(() => api(`/portal/webhook-deliveries/${d.id}/redeliver`, { method: "POST" }))}>{t("wh.redeliver")}</Button></td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
