"use client";

import { useState } from "react";
import { PaymentProvider, TransactionDto } from "@ayitipay/shared";
import { callPublicApi } from "@/lib/apiClient";
import { useErrorMessage, useT } from "@/lib/i18n";

export default function ConsolePage() {
  const t = useT();
  const errorMessage = useErrorMessage();
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState<PaymentProvider>("MONCASH");
  const [amount, setAmount] = useState(500);
  const [transaction, setTransaction] = useState<TransactionDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createPayment() {
    setError(null);
    setBusy(true);
    try {
      const tx = await callPublicApi<TransactionDto>("/payments", apiKey, {
        method: "POST",
        body: { provider, amount, currency: "HTG", reference: `console_${Date.now()}` },
      });
      setTransaction(tx);
    } catch (err) {
      setError(errorMessage(err, "con.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function simulate(outcome: "success" | "failure") {
    if (!transaction) return;
    setBusy(true);
    setError(null);
    try {
      const tx = await callPublicApi<TransactionDto>(`/sandbox/payments/${transaction.id}/simulate`, apiKey, {
        method: "POST",
        body: { outcome },
      });
      setTransaction(tx);
    } catch (err) {
      setError(errorMessage(err, "con.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function refreshStatus() {
    if (!transaction) return;
    const tx = await callPublicApi<TransactionDto>(`/payments/${transaction.id}`, apiKey);
    setTransaction(tx);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy mb-2">{t("con.title")}</h1>
      <p className="text-slate-600 mb-6">{t("con.intro")}</p>

      <div className="space-y-3 bg-white border border-slate-200 rounded-lg p-5 mb-6">
        <label className="block text-sm">
          <span className="block text-slate-600 mb-1">{t("con.key")}</span>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="pay_test_..."
            className="w-full border border-slate-300 rounded-lg px-3 py-2 font-mono text-sm"
          />
        </label>
        <div className="flex gap-3">
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">{t("con.provider")}</span>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as PaymentProvider)}
              className="border border-slate-300 rounded-lg px-2 py-1.5"
            >
              <option value="MONCASH">MonCash</option>
              <option value="NATCASH">NatCash</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">{t("con.amount")}</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="border border-slate-300 rounded-lg px-2 py-1.5 w-32"
            />
          </label>
        </div>
        <button
          onClick={createPayment}
          disabled={!apiKey || busy}
          className="bg-navy text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          {t("con.create")}
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {transaction && (
        <div className="bg-slate-900 text-lime rounded-lg p-4 text-sm mb-4 overflow-x-auto">
          <pre>{JSON.stringify(transaction, null, 2)}</pre>
        </div>
      )}

      {transaction && transaction.status === "PENDING" && (
        <div className="flex gap-2">
          <button
            onClick={() => simulate("success")}
            disabled={busy}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {t("con.success")}
          </button>
          <button
            onClick={() => simulate("failure")}
            disabled={busy}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {t("con.failure")}
          </button>
          <button onClick={refreshStatus} className="border border-slate-300 px-4 py-2 rounded-lg text-sm">
            {t("con.refresh")}
          </button>
        </div>
      )}
    </div>
  );
}
