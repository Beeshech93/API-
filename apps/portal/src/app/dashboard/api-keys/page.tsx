"use client";

import { useEffect, useState } from "react";
import { api, callPublicApi } from "@/lib/apiClient";
import { useErrorMessage, useT } from "@/lib/i18n";
import { Badge, Button, Card, CopyButton, ErrorNote, PageTitle, Select, Table, TextInput } from "@/components/ui";
import { useAccount } from "@/lib/useAccount";

// Receiving payments and sending money are two separate APIs, each with its own kind of key.
type Api = "receive" | "send";
const API_PERMISSIONS: Record<Api, string[]> = {
  receive: ["payments:read", "payments:create", "transactions:read", "balance:read", "webhooks:manage"],
  send: ["transfers:read", "transfers:create", "transactions:read", "balance:read", "webhooks:manage"],
};
const DEFAULT_PERMISSIONS: Record<Api, string[]> = {
  receive: ["payments:read", "payments:create", "transactions:read", "balance:read"],
  send: ["transfers:read", "transfers:create", "transactions:read", "balance:read"],
};

interface Key {
  id: string;
  name: string;
  environment: "TEST" | "LIVE";
  masked_key: string;
  permissions: string[];
  category: "receive" | "send" | "both";
  last_used_at: string | null;
  status: "active" | "revoked";
  created_at: string;
}

function KeyTable({ list, t, onRotate, onRevoke }: { list: Key[]; t: (key: string) => string; onRotate: (id: string) => void; onRevoke: (id: string) => void }) {
  return (
    <Table head={[t("keys.name"), t("keys.key"), t("keys.environment"), t("keys.permissions"), t("keys.created"), t("keys.lastUsed"), t("common.status"), ""]} empty={t("keys.empty")}>
      {list.map((k) => (
        <tr key={k.id}>
          <td className="font-medium">{k.name}</td>
          <td className="font-mono text-xs whitespace-nowrap">{k.masked_key}</td>
          <td><Badge value={k.environment.toLowerCase()} label={t(`env.${k.environment.toLowerCase()}`)} /></td>
          <td className="text-xs text-slate-500 max-w-[220px]">{k.permissions.join(", ")}</td>
          <td className="whitespace-nowrap">{new Date(k.created_at).toLocaleDateString()}</td>
          <td className="whitespace-nowrap">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : t("common.never")}</td>
          <td><Badge value={k.status} label={t(`status.${k.status}`)} /></td>
          <td className="whitespace-nowrap">
            {k.status === "active" && (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => onRotate(k.id)}>{t("keys.rotate")}</Button>
                <Button variant="danger" onClick={() => onRevoke(k.id)}>{t("keys.revoke")}</Button>
              </div>
            )}
          </td>
        </tr>
      ))}
    </Table>
  );
}

export default function ApiKeysPage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [keys, setKeys] = useState<Key[]>([]);
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<"TEST" | "LIVE">("TEST");
  const account = useAccount();
  const available: Api[] = (["receive", "send"] as const).filter((a) => !account || account.services[a]);
  const [chosen, setChosen] = useState<Api>("receive");
  const api_ = available.includes(chosen) ? chosen : available[0] ?? "receive";
  const allowed = API_PERMISSIONS[api_];
  const [permissions, setPermissions] = useState<string[]>(DEFAULT_PERMISSIONS.receive);
  const active = (list: Key[]) => list.filter((k) => k.status === "active");
  const ofCategory = (c: Key["category"]) => keys.filter((k) => k.category === c);
  const olderKeys = ofCategory("both");
  const [revealed, setRevealed] = useState<(Key & { api_key: string }) | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api<{ api_keys: Key[] }>("/portal/api-keys").then((d) => setKeys(d.api_keys)).catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const created = await api<Key & { api_key: string }>("/portal/api-keys", { method: "POST", body: { name, environment, category: api_, permissions: permissions.filter((p) => allowed.includes(p)) } });
      setRevealed(created);
      setTestResult(null);
      setName("");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function rotate(id: string) {
    if (!confirm(t("keys.confirmRotate"))) return;
    try {
      setRevealed(await api<Key & { api_key: string }>(`/portal/api-keys/${id}/rotate`, { method: "POST" }));
      setTestResult(null);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function revoke(id: string) {
    if (!confirm(t("keys.confirmRevoke"))) return;
    try {
      await api(`/portal/api-keys/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function testKey() {
    if (!revealed) return;
    try {
      const res = await callPublicApi<{ fee: number; total: number }>("/quote?amount=1000&currency=HTG&provider=moncash", revealed.api_key);
      setTestResult(`OK — quote 1000 HTG: fee ${res.fee}, total ${res.total}`);
    } catch (e) {
      setTestResult(errorMessage(e));
    }
  }

  const toggle = (p: string) => setPermissions((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  return (
    <div>
      <PageTitle title={t("nav.apiKeys")} subtitle={t("keys.subtitle")} />

      {revealed && (
        <Card className="p-5 mb-6 border-amber-300 bg-amber-50">
          <p className="text-sm font-semibold text-amber-800">{t("keys.copyNow")}</p>
          <code className="block mt-2 bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm break-all">{revealed.api_key}</code>
          <div className="flex flex-wrap gap-2 mt-3 items-center">
            <CopyButton text={revealed.api_key} label={t("common.copy")} doneLabel={t("common.copied")} />
            {revealed.environment === "TEST" && <Button variant="secondary" onClick={testKey}>{t("keys.test")}</Button>}
            <Button variant="ghost" onClick={() => setRevealed(null)}>{t("common.dismiss")}</Button>
          </div>
          {testResult && <p className="text-sm mt-2 text-slate-700">{testResult}</p>}
        </Card>
      )}

      {/* Keys are grouped by what they are for: receiving payments or sending money. */}
      <div role="tablist" className="flex flex-wrap gap-2 mb-4">
        {available.map((a) => (
          <button
            key={a}
            role="tab"
            type="button"
            aria-selected={api_ === a}
            onClick={() => { setChosen(a); setPermissions(DEFAULT_PERMISSIONS[a]); setError(null); }}
            className={`px-5 py-2.5 rounded-full border text-sm font-semibold ${api_ === a ? "bg-brand text-white border-brand" : "border-slate-300 text-slate-600 hover:border-brand"}`}
          >
            {t(`keys.api.${a}`)} <span className={`ml-1 text-xs ${api_ === a ? "text-white/80" : "text-slate-400"}`}>({active(ofCategory(a)).length})</span>
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-600 mb-4 max-w-3xl">{t(`keys.cat.${api_}.desc`)}</p>

      <Card className="p-5 mb-6">
        <h2 className="font-semibold text-navy mb-3">{t(`keys.cat.${api_}.create`)}</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <TextInput label={t("keys.name")} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          <Select label={t("keys.environment")} value={environment} onChange={(e) => setEnvironment(e.target.value as "TEST" | "LIVE")}>
            <option value="TEST">{t("env.test")}</option>
            <option value="LIVE">{t("env.live")}</option>
          </Select>
        </div>
        <fieldset className="mt-4">
          <legend className="text-sm text-slate-600 mb-2">{t("keys.permissions")}</legend>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {allowed.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={permissions.includes(p)} onChange={() => toggle(p)} />
                <code className="text-xs">{p}</code>
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">{t("keys.apiHint")}</p>
        </fieldset>
        <div className="mt-4">
          <Button onClick={create} disabled={busy || !name.trim() || permissions.filter((p) => allowed.includes(p)).length === 0}>{t(`keys.cat.${api_}.create`)}</Button>
        </div>
        <ErrorNote message={error} />
      </Card>

      <KeyTable list={ofCategory(api_)} t={t} onRotate={rotate} onRevoke={revoke} />

      {olderKeys.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold text-navy mb-1">{t("keys.older.title")}</h2>
          <p className="text-sm text-slate-500 mb-3 max-w-3xl">{t("keys.older.body")}</p>
          <KeyTable list={olderKeys} t={t} onRotate={rotate} onRevoke={revoke} />
        </div>
      )}
    </div>
  );
}
