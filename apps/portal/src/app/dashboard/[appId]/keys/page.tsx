"use client";

import { useEffect, useState } from "react";
import { callPortalApi } from "@/lib/apiClient";
import { ApiKeySummary, IssuedApiKey } from "@/lib/types";
import { KeyMode } from "@ayitipay/shared";
import { useT } from "@/lib/i18n";

export default function ApiKeysPage({ params }: { params: { appId: string } }) {
  const t = useT();
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [revealed, setRevealed] = useState<IssuedApiKey | null>(null);
  const [mode, setMode] = useState<KeyMode>("TEST");
  const [label, setLabel] = useState("");
  const [issuing, setIssuing] = useState(false);

  async function refresh() {
    setKeys(await callPortalApi<ApiKeySummary[]>(`/portal/applications/${params.appId}/keys`));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.appId]);

  async function issueKey() {
    setIssuing(true);
    try {
      const key = await callPortalApi<IssuedApiKey>(`/portal/applications/${params.appId}/keys`, {
        method: "POST",
        body: { mode, label: label || undefined },
      });
      setRevealed(key);
      setLabel("");
      await refresh();
    } finally {
      setIssuing(false);
    }
  }

  async function revoke(id: string) {
    await callPortalApi(`/portal/applications/${params.appId}/keys/${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-navy mb-4">{t("keys.title")}</h2>

      {revealed && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-6">
          <p className="text-sm font-medium text-amber-800 mb-2">
            {t("keys.copyNow")}
          </p>
          <code className="block bg-white border border-amber-200 rounded px-3 py-2 text-sm break-all">
            {revealed.fullToken}
          </code>
        </div>
      )}

      <div className="flex gap-2 items-end mb-6 bg-white border border-slate-200 rounded-lg p-4">
        <label className="text-sm">
          <span className="block text-slate-600 mb-1">{t("keys.mode")}</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as KeyMode)}
            className="border border-slate-300 rounded-lg px-2 py-1.5"
          >
            <option value="TEST">{t("keys.test")}</option>
            <option value="LIVE">{t("keys.live")}</option>
          </select>
        </label>
        <label className="text-sm flex-1">
          <span className="block text-slate-600 mb-1">{t("keys.labelOpt")}</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-2 py-1.5"
          />
        </label>
        <button
          onClick={issueKey}
          disabled={issuing}
          className="bg-navy text-white px-4 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          {issuing ? t("keys.issuing") : t("keys.issue")}
        </button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-200">
            <th className="py-2">{t("keys.prefix")}</th>
            <th>{t("keys.mode")}</th>
            <th>{t("keys.label")}</th>
            <th>{t("keys.lastUsed")}</th>
            <th>{t("keys.status")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key.id} className="border-b border-slate-100">
              <td className="py-2 font-mono">{key.keyPrefix}…</td>
              <td>{key.mode}</td>
              <td>{key.label ?? "—"}</td>
              <td>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : t("keys.never")}</td>
              <td>{key.revokedAt ? t("keys.revoked") : t("keys.active")}</td>
              <td>
                {!key.revokedAt && (
                  <button onClick={() => revoke(key.id)} className="text-red-600 text-xs underline">
                    {t("keys.revoke")}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
