"use client";

import { FormEvent, useEffect, useState } from "react";
import { PaymentProvider } from "@ayitipay/shared";
import { callPortalApi } from "@/lib/apiClient";
import { ProviderCredentialSummary } from "@/lib/types";
import { useErrorMessage, useT } from "@/lib/i18n";

const PROVIDERS: { value: PaymentProvider; label: string }[] = [
  { value: "MONCASH", label: "MonCash (Digicel)" },
  { value: "NATCASH", label: "NatCash (Natcom)" },
];

export default function ProvidersPage({ params }: { params: { appId: string } }) {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [credentials, setCredentials] = useState<ProviderCredentialSummary[]>([]);
  const [provider, setProvider] = useState<PaymentProvider>("MONCASH");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setCredentials(await callPortalApi<ProviderCredentialSummary[]>(`/portal/applications/${params.appId}/credentials`));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.appId]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await callPortalApi(`/portal/applications/${params.appId}/credentials`, {
        method: "PUT",
        body: { provider, clientId, clientSecret, webhookSecret, baseUrl: baseUrl || undefined },
      });
      setClientId("");
      setClientSecret("");
      setWebhookSecret("");
      setBaseUrl("");
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: PaymentProvider) {
    await callPortalApi(`/portal/applications/${params.appId}/credentials/${p}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-navy mb-2">{t("prov.title")}</h2>
      <p className="text-sm text-slate-500 mb-6">
        {t("prov.intro")}
      </p>

      <ul className="mb-8 space-y-2">
        {credentials.map((cred) => (
          <li
            key={cred.id}
            className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-3"
          >
            <div>
              <p className="font-medium text-navy">
                {PROVIDERS.find((p) => p.value === cred.provider)?.label ?? cred.provider}
              </p>
              <p className="text-xs text-slate-500">{cred.active ? t("prov.active") : t("prov.inactive")}</p>
            </div>
            <button onClick={() => remove(cred.provider)} className="text-red-600 text-xs underline">
              {t("prov.disconnect")}
            </button>
          </li>
        ))}
        {credentials.length === 0 && <p className="text-sm text-slate-400">{t("prov.none")}</p>}
      </ul>

      <form onSubmit={save} className="bg-white border border-slate-200 rounded-lg p-5 space-y-3 max-w-lg">
        <h3 className="font-semibold text-navy text-sm">{t("prov.addUpdate")}</h3>
        <label className="block text-sm">
          <span className="block text-slate-600 mb-1">{t("prov.provider")}</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as PaymentProvider)}
            className="w-full border border-slate-300 rounded-lg px-2 py-1.5"
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <Field label={t("prov.clientId")} value={clientId} onChange={setClientId} />
        <Field label={t("prov.clientSecret")} value={clientSecret} onChange={setClientSecret} type="password" />
        <Field label={t("prov.webhookSecret")} value={webhookSecret} onChange={setWebhookSecret} type="password" />
        <Field label={t("prov.baseUrl")} value={baseUrl} onChange={setBaseUrl} required={false} />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="bg-navy text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          {saving ? t("prov.saving") : t("prov.save")}
        </button>
        <p className="text-xs text-slate-400">{t("prov.note")}</p>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="block text-slate-600 mb-1">{label}</span>
      <input
        required={required}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-slate-300 rounded-lg px-2 py-1.5"
      />
    </label>
  );
}
