"use client";

import Link from "next/link";
import { useState } from "react";
import { API_URL } from "@/lib/apiClient";
import { useT } from "@/lib/i18n";
import { SANDBOX_NUMBERS, samples } from "./samples";

const SECTIONS = ["intro", "auth", "keys", "moncash", "natcash", "payments", "transfers", "transactions", "balance", "quote", "webhooks", "errors", "limits", "sandbox", "live"] as const;
const LANGS = ["curl", "javascript", "node", "php", "python"] as const;
const LANG_LABEL: Record<(typeof LANGS)[number], string> = { curl: "cURL", javascript: "JavaScript", node: "Node.js", php: "PHP", python: "Python" };

const ENDPOINTS = [
  ["GET", "/api/v1/health", "—"],
  ["GET", "/api/v1/quote?amount=1000&currency=HTG&provider=moncash", "payments:read"],
  ["POST", "/api/v1/moncash/payments", "payments:create"],
  ["GET", "/api/v1/moncash/transactions/{transaction_id}", "transactions:read"],
  ["GET", "/api/v1/moncash/transactions", "transactions:read"],
  ["GET", "/api/v1/moncash/balance", "balance:read"],
  ["POST", "/api/v1/moncash/transfers", "transfers:create"],
  ["GET", "/api/v1/moncash/transfers/{transaction_id}", "transfers:read"],
  ["GET", "/api/v1/moncash/transfers", "transfers:read"],
  ["POST", "/api/v1/natcash/payments", "payments:create"],
  ["POST", "/api/v1/natcash/transfers", "transfers:create"],
  ["GET", "/api/v1/natcash/transfers/{transaction_id}", "transfers:read"],
  ["GET", "/api/v1/natcash/transfers", "transfers:read"],
  ["GET", "/api/v1/natcash/transactions/{transaction_id}", "transactions:read"],
  ["GET", "/api/v1/natcash/transactions", "transactions:read"],
  ["GET", "/api/v1/natcash/balance", "balance:read"],
  ["POST", "/api/v1/sandbox/transactions/{transaction_id}/simulate", "payments:create | transfers:create (TEST)"],
];

const ERRORS = [
  ["INVALID_API_KEY", "401"], ["UNAUTHORIZED", "401"], ["FORBIDDEN", "403"], ["INVALID_REQUEST", "400 / 422"], ["INVALID_AMOUNT", "400"], ["INVALID_PHONE", "400"],
  ["INSUFFICIENT_BALANCE", "402"], ["PROVIDER_ERROR", "502"], ["PROVIDER_TIMEOUT", "504"], ["TRANSACTION_FAILED", "422"], ["TRANSACTION_NOT_FOUND", "404"],
  ["RATE_LIMIT_EXCEEDED", "429"], ["SUBSCRIPTION_REQUIRED", "402"],
];

const PLAN_LIMITS = [["Starter", "$29", "1,000", "1", "100"], ["Business", "$79", "10,000", "5", "500"], ["Pro", "$199", "50,000", "20", "2,000"], ["Enterprise", "—", "custom", "custom", "custom"]];

function Code({ children }: { children: string }) {
  return <pre className="bg-navy text-slate-100 text-xs sm:text-sm rounded-xl p-4 overflow-x-auto"><code>{children}</code></pre>;
}

function LangTabs({ group }: { group: keyof ReturnType<typeof samples> }) {
  const [lang, setLang] = useState<(typeof LANGS)[number]>("curl");
  const set = samples(API_URL)[group] as Partial<Record<(typeof LANGS)[number], string>>;
  const available = LANGS.filter((l) => set[l]);
  return (
    <div className="my-3">
      <div role="tablist" className="flex flex-wrap gap-1 mb-2">
        {available.map((l) => (
          <button key={l} role="tab" aria-selected={lang === l} onClick={() => setLang(l)} className={`px-3 py-1 rounded-full text-xs font-semibold ${lang === l ? "bg-brand text-white" : "bg-slate-200 text-slate-700 hover:bg-slate-300"}`}>{LANG_LABEL[l]}</button>
        ))}
      </div>
      <Code>{set[available.includes(lang) ? lang : available[0]] ?? ""}</Code>
    </div>
  );
}

export default function DocsPage() {
  const t = useT();
  const s = samples(API_URL);
  return (
    <div className="lg:flex gap-10">
      <aside className="lg:w-56 shrink-0 mb-6 lg:mb-0">
        <nav className="lg:sticky lg:top-20 flex lg:flex-col flex-wrap gap-1 text-sm" aria-label={t("doc.onThisPage")}>
          {SECTIONS.map((id) => (
            <a key={id} href={`#${id}`} className="px-3 py-1.5 rounded-lg hover:bg-slate-200 text-slate-700">{t(`doc.${id}.title`)}</a>
          ))}
          <Link href="/docs/console" className="px-3 py-1.5 rounded-lg bg-brand text-white font-semibold mt-2">{t("docs.tryIt")}</Link>
        </nav>
      </aside>

      <article className="flex-1 min-w-0 max-w-3xl space-y-12">
        <header>
          <h1 className="text-3xl font-bold text-navy">{t("docs.indexTitle")}</h1>
          <p className="text-slate-600 mt-2">{t("docs.indexBody")}</p>
        </header>

        {SECTIONS.map((id) => (
          <section key={id} id={id} className="scroll-mt-24">
            <h2 className="text-xl font-bold text-navy mb-2">{t(`doc.${id}.title`)}</h2>
            <p className="text-slate-700 leading-relaxed">{t(`doc.${id}.body`)}</p>

            {id === "intro" && (
              <>
                <p className="mt-3 text-sm text-slate-500">{t("doc.base")}</p>
                <Code>{`${API_URL}/api/v1`}</Code>
                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-sm bg-white border border-slate-200 rounded-xl">
                    <thead><tr className="text-left text-slate-500 border-b bg-slate-50"><th className="p-3">HTTP</th><th className="p-3">{t("doc.endpoint")}</th><th className="p-3">{t("doc.perm")}</th></tr></thead>
                    <tbody>{ENDPOINTS.map(([m, p, perm]) => (<tr key={m + p} className="border-b border-slate-100"><td className="p-3 font-mono text-xs">{m}</td><td className="p-3 font-mono text-xs break-all">{p}</td><td className="p-3 text-xs">{perm}</td></tr>))}</tbody>
                  </table>
                </div>
                <p className="mt-3 text-sm text-slate-500">GET /api/v1/health</p>
                <Code>{`{ "status": "ok", "service": "HaitiPay API", "version": "1.0.0" }`}</Code>
              </>
            )}

            {id === "auth" && <LangTabs group="auth" />}
            {id === "keys" && <Code>{`hp_live_xxxxxxxxxxxxxxxxxxxx   # LIVE   (needs an active subscription)\nhp_test_xxxxxxxxxxxxxxxxxxxx   # TEST   (sandbox, never moves real money)\n\n# After creation only the masked key is shown:\nhp_live_••••••••••••91KD`}</Code>}
            {(id === "moncash" || id === "natcash") && <LangTabs group={id === "moncash" ? "moncash" : "natcash"} />}
            {id === "payments" && (
              <>
                <LangTabs group="payment" />
                <p className="text-sm text-slate-500">{t("doc.response")} — 201</p>
                <Code>{s.paymentResponse}</Code>
              </>
            )}
            {id === "transfers" && (
              <>
                <LangTabs group="transfer" />
                <p className="text-sm text-slate-500">{t("doc.response")} — 201</p>
                <Code>{s.transferResponse}</Code>
              </>
            )}
            {id === "transactions" && <><LangTabs group="transaction" /><Code>{`GET /api/v1/moncash/transactions?limit=25&status=completed`}</Code></>}
            {id === "balance" && <><LangTabs group="balance" /><Code>{s.balanceResponse}</Code></>}
            {id === "quote" && <><LangTabs group="quote" /><Code>{`{ "amount": 1000, "fee": 10, "total": 1010, "currency": "HTG" }`}</Code></>}
            {id === "webhooks" && (
              <>
                <Code>{s.webhookPayload}</Code>
                <p className="text-sm text-slate-500 mt-3">{t("doc.verify")}</p>
                <LangTabs group="verify" />
              </>
            )}
            {id === "errors" && (
              <>
                <Code>{`{\n  "success": false,\n  "error": {\n    "code": "INSUFFICIENT_BALANCE",\n    "message": "Insufficient provider balance",\n    "request_id": "req_12345"\n  }\n}`}</Code>
                <div className="overflow-x-auto mt-3"><table className="w-full text-sm bg-white border border-slate-200 rounded-xl"><tbody>{ERRORS.map(([c, h]) => (<tr key={c} className="border-b border-slate-100"><td className="p-3 font-mono text-xs">{c}</td><td className="p-3 text-xs">{h}</td><td className="p-3 text-xs text-slate-500">{t(`err.${c}`)}</td></tr>))}</tbody></table></div>
              </>
            )}
            {id === "limits" && (
              <>
                <p className="text-sm text-slate-500 mt-3">{t("doc.plansTable")}</p>
                <div className="overflow-x-auto"><table className="w-full text-sm bg-white border border-slate-200 rounded-xl"><thead><tr className="text-left text-slate-500 border-b bg-slate-50"><th className="p-3">Plan</th><th className="p-3">USD / {t("plans.month")}</th><th className="p-3">{t("plans.requestsMonth")}</th><th className="p-3">{t("plans.keys")}</th><th className="p-3">{t("plans.perMinute")}</th></tr></thead><tbody>{PLAN_LIMITS.map((r) => (<tr key={r[0]} className="border-b border-slate-100">{r.map((c, i) => <td key={i} className="p-3">{c}</td>)}</tr>))}</tbody></table></div>
                <Code>{`HTTP/1.1 429 Too Many Requests\nRetry-After: 30\n\n{ "success": false, "error": { "code": "RATE_LIMIT_EXCEEDED", "message": "Too many requests", "request_id": "req_…", "retry_after": 30 } }`}</Code>
              </>
            )}
            {id === "sandbox" && (
              <>
                <p className="text-sm text-slate-500 mt-3">{t("doc.testNumbers")}</p>
                <div className="overflow-x-auto"><table className="w-full text-sm bg-white border border-slate-200 rounded-xl"><tbody>{SANDBOX_NUMBERS.map(([num, key]) => (<tr key={num} className="border-b border-slate-100"><td className="p-3 font-mono text-xs">{num}</td><td className="p-3 text-xs">{t(`doc.${key}`)}</td></tr>))}</tbody></table></div>
                <p className="text-sm text-slate-500 mt-3">{t("doc.simulate")}</p>
                <LangTabs group="simulate" />
                <Link href="/docs/console" className="inline-block mt-3 bg-brand text-white px-4 py-2 rounded-lg text-sm font-semibold">{t("docs.tryIt")}</Link>
              </>
            )}
          </section>
        ))}
      </article>
    </div>
  );
}
