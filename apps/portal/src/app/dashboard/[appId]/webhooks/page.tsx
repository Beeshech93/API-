"use client";

import { FormEvent, useEffect, useState } from "react";
import { callPortalApi } from "@/lib/apiClient";
import { WebhookDelivery, WebhookEndpoint } from "@/lib/types";

export default function WebhooksPage({ params }: { params: { appId: string } }) {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const [eps, dels] = await Promise.all([
      callPortalApi<WebhookEndpoint[]>(`/portal/applications/${params.appId}/webhook-endpoints`),
      callPortalApi<WebhookDelivery[]>(`/portal/applications/${params.appId}/webhook-deliveries`),
    ]);
    setEndpoints(eps);
    setDeliveries(dels);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.appId]);

  async function addEndpoint(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await callPortalApi(`/portal/applications/${params.appId}/webhook-endpoints`, {
        method: "POST",
        body: { url },
      });
      setUrl("");
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function removeEndpoint(id: string) {
    await callPortalApi(`/portal/applications/${params.appId}/webhook-endpoints/${id}`, { method: "DELETE" });
    await refresh();
  }

  async function redeliver(id: string) {
    await callPortalApi(`/portal/applications/${params.appId}/webhook-deliveries/${id}/redeliver`, {
      method: "POST",
    });
    await refresh();
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-navy mb-4">Webhook endpoints</h2>

      <ul className="space-y-2 mb-6">
        {endpoints.map((ep) => (
          <li key={ep.id} className="bg-white border border-slate-200 rounded-lg px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm">{ep.url}</span>
              <button onClick={() => removeEndpoint(ep.id)} className="text-red-600 text-xs underline">
                Remove
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Signing secret: <code>{ep.secret}</code>
            </p>
          </li>
        ))}
        {endpoints.length === 0 && <p className="text-sm text-slate-400">No webhook endpoints yet.</p>}
      </ul>

      <form onSubmit={addEndpoint} className="flex gap-2 mb-10 max-w-lg">
        <input
          required
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-app.com/webhooks/ayitipay"
          className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={saving}
          className="bg-navy text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          Add
        </button>
      </form>

      <h3 className="font-semibold text-navy text-sm mb-2">Recent deliveries</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-200">
            <th className="py-2">Event</th>
            <th>Status</th>
            <th>Attempts</th>
            <th>Last response</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {deliveries.map((d) => (
            <tr key={d.id} className="border-b border-slate-100">
              <td className="py-2">{d.eventType}</td>
              <td>{d.status}</td>
              <td>{d.attempts}</td>
              <td>{d.responseStatus ?? "—"}</td>
              <td>
                <button onClick={() => redeliver(d.id)} className="text-navy text-xs underline">
                  Redeliver
                </button>
              </td>
            </tr>
          ))}
          {deliveries.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-slate-400">
                No deliveries yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
