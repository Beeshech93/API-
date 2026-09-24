"use client";

import Link from "next/link";
import { useState } from "react";
import { API_URL } from "@/lib/apiClient";
import { useT } from "@/lib/i18n";
import { SANDBOX_NUMBERS, samples } from "./samples";

const SECTIONS = ["intro", "auth", "keys", "receive", "payments", "send", "transfers", "transactions", "balance", "quote", "webhooks", "errors", "limits", "sandbox", "live"] as const;
const LANGS = ["curl", "javascript", "node", "php", "python"] as const;
const LANG_LABEL: Record<(typeof LANGS)[number], string> = { curl: "cURL", javascript: "JavaScript", node: "Node.js", php: "PHP", python: "Python" };

// Two separate APIs, each with its own paths and its own kind of key.
const RECEIVE_ENDPOINTS = [
  ["POST", "/api/v1/receive/{moncash|natcash}/payments", "payments:create"],
  ["GET", "/api/v1/receive/{network}/payments/{transaction_id}", "payments:read"],
  ["GET", "/api/v1/receive/{network}/payments", "payments:read"],
  ["GET", "/api/v1/receive/{network}/transactions", "transactions:read"],
  ["GET", "/api/v1/receive/{network}/balance", "balance:read"],
];
const SEND_ENDPOINTS = [
  ["POST", "/api/v1/send/{moncash|natcash}/transfers", "transfers:create"],
  ["GET", "/api/v1/send/{network}/transfers/{transaction_id}", "transfers:read"],
  ["GET", "/api/v1/send/{network}/transfers", "transfers:read"],
  ["GET", "/api/v1/send/{network}/transactions", "transactions:read"],
  ["GET", "/api/v1/send/{network}/balance", "balance:read"],
];
const COMMON_ENDPOINTS = [
  ["GET", "/api/v1/health", "—"],
  ["GET", "/api/v1/quote?amount=1000&currency=HTG&provider=moncash", "payments:read | transfers:read"],
  ["POST", "/api/v1/sandbox/transactions/{transaction_id}/simulate", "payments:create | transfers:create (TEST)"],
  ["POST", "/api/v1/sandbox/fund", "transfers:create (TEST)"],
];

function EndpointTable({ rows, permLabel, endpointLabel }: { rows: string[][]; permLabel: string; endpointLabel: string }) {
  return (
    <div className="overflow-x-auto mt-3">
      <table className="w-full text-sm bg-white border border-slate-200 rounded-xl">
        <thead><tr className="text-left text-slate-500 border-b bg-slate-50"><th className="p-3">HTTP</th><th className="p-3">{endpointLabel}</th><th className="p-3">{permLabel}</th></tr></thead>
        <tbody>{rows.map(([m, p, perm]) => (<tr key={m + p} className="border-b border-slate-100"><td className="p-3 font-mono text-xs">{m}</td><td className="p-3 font-mono text-xs break-all">{p}</td><td className="p-3 text-xs text-slate-500">{perm}</td></tr>))}</tbody>
      </table>
    </div>
  );
}

const ERRORS = [
  ["INVALID_API_KEY", "401"], ["UNAUTHORIZED", "401"], ["FORBIDDEN", "403"], ["INVALID_REQUEST", "400 / 422"], ["INVALID_AMOUNT", "400"], ["INVALID_PHONE", "400"],
  ["INSUFFICIENT_BALANCE", "402"], ["PROVIDER_ERROR", "502"], ["PROVIDER_TIMEOUT", "504"], ["TRANSACTION_FAILED", "422"], ["TRANSACTION_NOT_FOUND", "404"],
  ["RATE_LIMIT_EXCEEDED", "429"],
];

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
                <EndpointTable rows={COMMON_ENDPOINTS} permLabel={t("doc.perm")} endpointLabel={t("doc.endpoint")} />
                <p className="mt-3 text-sm text-slate-500">GET /api/v1/health</p>
                <Code>{`{ "status": "ok", "service": "HaitiPay API", "version": "1.0.0" }`}</Code>
              </>
            )}

            {id === "auth" && <LangTabs group="auth" />}
            {id === "keys" && <Code>{`hp_live_xxxxxxxxxxxxxxxxxxxx   # LIVE   (needs LIVE access enabled for your account)\nhp_test_xxxxxxxxxxxxxxxxxxxx   # TEST   (sandbox, never moves real money)\n\n# After creation only the masked key is shown:\nhp_live_••••••••••••91KD`}</Code>}
            {id === "receive" && <EndpointTable rows={RECEIVE_ENDPOINTS} permLabel={t("doc.perm")} endpointLabel={t("doc.endpoint")} />}
            {id === "send" && <EndpointTable rows={SEND_ENDPOINTS} permLabel={t("doc.perm")} endpointLabel={t("doc.endpoint")} />}
            {id === "payments" && (
              <>
                <LangTabs group="payment" />
                <p className="text-sm text-slate-500">{t("doc.response")} — 201</p>
                <Code>{s.paymentResponse}</Code>
                <p className="text-sm text-slate-500 mt-3">GET /api/v1/receive/{"{network}"}/payments/{"{transaction_id}"}</p>
                <LangTabs group="transaction" />
              </>
            )}
            {id === "transfers" && (
              <>
                <LangTabs group="transfer" />
                <p className="text-sm text-slate-500">{t("doc.response")} — 201</p>
                <Code>{s.transferResponse}</Code>
                <p className="text-sm text-slate-500 mt-3">GET /api/v1/send/{"{network}"}/transfers/{"{transaction_id}"}</p>
                <LangTabs group="transferStatus" />
              </>
            )}
            {id === "transactions" && <><Code>{`GET /api/v1/receive/moncash/transactions?limit=25&status=completed\nGET /api/v1/send/moncash/transactions?limit=25&status=completed`}</Code></>}
            {id === "balance" && <><LangTabs group="balance" /><p className="text-sm text-slate-500 mt-3">GET /api/v1/send/moncash/balance</p><Code>{s.balanceResponse}</Code></>}
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
