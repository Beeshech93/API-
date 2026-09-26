// Integration test — run with `npm run test:e2e` (see e2e/README.md). Needs E2E_DATABASE_URL.
const { DB_URL, SCHEMA, withSchema, ROOT } = require("./env");
const { Client } = require("pg"); const crypto = require("crypto"); const fs = require("fs");
const API = "http://localhost:4100", MOCK = "http://localhost:4300", S = SCHEMA, WH = "whsec_local_secret";
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  ", n); } else { fail++; console.log("  FAIL", n, x !== undefined ? JSON.stringify(x).slice(0, 350) : ""); } };
async function call(method, path, { token, key, body, headers = {}, rawBody } = {}) {
  const res = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token || key ? { Authorization: `Bearer ${token || key}` } : {}), ...headers }, body: rawBody ?? (body ? JSON.stringify(body) : undefined) });
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: res.status, json: j, raw: t };
}
const mock = async (p, body) => (await fetch(MOCK + p, { method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined })).json();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const signed = (payload, secret = WH) => { const raw = JSON.stringify(payload), ts = Math.floor(Date.now() / 1000), evt = "evt_" + crypto.randomBytes(4).toString("hex");
  return { rawBody: raw, headers: { "x-mock-timestamp": String(ts), "x-mock-event-id": evt, "x-mock-signature": "v1=" + crypto.createHmac("sha256", secret).update(`${ts}.${evt}.${raw}`).digest("hex") } }; };
(async () => {
  const db = new Client({ connectionString: DB_URL }); await db.connect();
  await db.query(`TRUNCATE ${S}.fundings, ${S}.transactions, ${S}.audit_logs CASCADE`); await db.query(`DELETE FROM ${S}.platform_settings WHERE key IN ('provider_connection','funding_methods')`);
  const stamp = Date.now(), PW = "Str0ng-Passw0rd!";
  const su = async l => (await call("POST", "/auth/signup", { body: { services: ["receive", "send"], email: `${l}${stamp}@example.com`, password: PW, name: l } })).json;
  const adm = await su("fadmin"); await db.query(`UPDATE ${S}.users SET role='ADMIN' WHERE id=$1`, [adm.user.id]);
  const A = (await call("POST", "/auth/login", { body: { email: `fadmin${stamp}@example.com`, password: PW } })).json.access_token;
  const cl = await su("fclient"); const T = cl.access_token, cid = cl.user.clientId;
  const fund = (body, token = T) => call("POST", "/portal/funding", { token, body });
  const view = async () => (await call("GET", "/portal/funding", { token: T })).json;
  const bal = async () => (await view()).balance;
  const st = async id => (await db.query(`SELECT status, credited_amount::float8 c FROM ${S}.fundings WHERE id=$1`, [id])).rows[0];

  console.log("-- gates");
  let r = await fund({ method: "moncash", amount: 1000 }); ok("client without LIVE access can't recharge (403)", r.status === 403 && /KYC|LIVE access/.test(r.json.error.message), r.json);
  await db.query(`UPDATE ${S}.clients SET kyc_status='APPROVED' WHERE id=$1`, [cid]);
  await call("POST", `/admin/clients/${cid}/live-access`, { token: A, body: { enabled: true } });
  r = await fund({ method: "moncash", amount: 1000 }); ok("MonCash before the provider is connected -> 502, nothing created", r.status === 502 && (await db.query(`SELECT count(*)::int n FROM ${S}.fundings`)).rows[0].n === 0, r);
  r = await call("PUT", "/admin/settings/funding", { token: T, body: {} }); ok("client can't edit funding methods (403)", r.status === 403);
  await call("PUT", "/admin/providers/config", { token: A, body: { name: "Local Mock", apiUrl: MOCK, apiKey: "prov_test_user", secretKey: "sk_test_secret", webhookSecret: WH } });
  const cfg = (await call("GET", "/admin/settings/funding", { token: A })).json.methods;
  ok("defaults: only MonCash enabled", cfg.MONCASH.enabled && !cfg.ZELLE.enabled && !cfg.NATCASH.enabled, cfg);
  cfg.ZELLE = { enabled: true, minAmount: 500, instructions: "Zelle to pay@example.com — put your email in the memo" };
  cfg.NATCASH = { enabled: true, minAmount: 200, instructions: "Send NatCash to 4400 0000" };
  r = await call("PUT", "/admin/settings/funding", { token: A, body: cfg }); ok("admin enables Zelle + NatCash with instructions", r.status === 200 && r.json.methods.ZELLE.enabled, r.json);
  let v = await view();
  ok("client sees MonCash (automatic, no instructions) + the enabled manual methods", v.methods.map(m => m.method).sort().join() === "moncash,natcash,zelle" && v.methods.find(m => m.method === "moncash").automatic && v.methods.find(m => m.method === "zelle").instructions.includes("pay@example.com"), v.methods);
  ok("disabled methods are hidden", !v.methods.some(m => m.method === "bank_deposit"));
  ok("balance starts at 0", v.balance.available === 0 && v.balance.funded === 0);

  console.log("-- MonCash: automatic");
  await mock("/__reset", {});
  r = await fund({ method: "moncash", amount: 2000 }); const F1 = r.json.funding && r.json.funding.id;
  ok("201 pending with a payment_url", r.status === 201 && r.json.funding.status === "pending" && /^https:\/\/moncashbutton\.example/.test(r.json.funding.payment_url), r.json);
  let log = (await mock("/__state")).log.find(l => l.path === "/moncash/token");
  ok("provider got the amount, our funding id as reference, portal return URLs and our webhook URL", log.body.gdes === 2000 && log.body.referenceId === F1 && /\/dashboard\/funding\?result=success$/.test(log.body.successUrl) && log.body.webhookUrl === "https://api.example.test/webhooks/provider", log.body);
  ok("nothing credited while pending", (await bal()).available === 0);
  const order = Object.keys((await mock("/__state")).orders).pop();
  await mock("/__set", { id: order, status: "successful" });
  let w = signed({ type: "payment.succeeded", orderId: order }, "wrong"); r = await call("POST", "/webhooks/provider", w); ok("forged notification -> 401, still pending", r.status === 401 && (await st(F1)).status === "PENDING");
  w = signed({ type: "payment.succeeded", orderId: order }); r = await call("POST", "/webhooks/provider", w);
  ok("signed notification -> provider re-read -> COMPLETED, credited 2000", r.status === 200 && (await st(F1)).status === "COMPLETED" && (await st(F1)).c === 2000, await st(F1));
  r = await call("POST", "/webhooks/provider", w); ok("replaying it never credits twice", (await bal()).available === 2000 && (await bal()).funded === 2000, await bal());

  console.log("-- amount mismatch / failure never credit");
  r = await fund({ method: "moncash", amount: 500 }); const F2 = r.json.funding.id; const o2 = Object.keys((await mock("/__state")).orders).pop();
  await mock("/__set", { id: o2, status: "successful", amount: 100 }); await call("POST", "/webhooks/provider", signed({ orderId: o2 }));
  ok("provider reports a different amount -> stays PENDING, audited", (await st(F2)).status === "PENDING" && (await db.query(`SELECT count(*)::int n FROM ${S}.audit_logs WHERE action='provider.amount_mismatch'`)).rows[0].n === 1);
  await mock("/__set", { id: o2, status: "failed", amount: 500 }); await call("POST", "/webhooks/provider", signed({ orderId: o2 }));
  ok("provider says failed -> FAILED, no credit", (await st(F2)).status === "FAILED" && (await bal()).available === 2000);
  r = await fund({ method: "moncash", amount: 50 }); ok("below the minimum (100) -> 400", r.status === 400 && r.json.error.code === "INVALID_AMOUNT", r.json);
  r = await fund({ method: "moncash", amount: 90000 }); ok("above the provider limit (75,000) -> 400, nothing created", r.status === 400, r.json);

  console.log("-- funded money is spendable through the API");
  const key = (await call("POST", "/portal/api-keys", { token: T, body: { name: "live", environment: "LIVE", permissions: ["transfers:create", "balance:read", "transfers:read"] } })).json.api_key;
  r = await call("POST", "/api/v1/moncash/transfers", { key, headers: { "Idempotency-Key": "f-t1" }, body: { amount: 400, currency: "HTG", phone: "50937123456", recipient: { first_name: "Melissa", last_name: "Francois" } } });
  ok("transfer of 400 allowed with recharged funds", r.status === 201, r.json);
  r = await call("GET", "/api/v1/moncash/balance", { key });
  ok("API balance: funded 2000, sent 400, fee 4, available 1596", r.json.balances[0].funded === 2000 && r.json.balances[0].sent === 400 && r.json.balances[0].available === 1596, r.json.balances);
  r = await call("POST", "/api/v1/natcash/transfers", { key, headers: { "Idempotency-Key": "f-t2" }, body: { amount: 5000, currency: "HTG", phone: "50937123456", recipient: { first_name: "A", last_name: "B" } } });
  ok("can't send more than the balance -> 402", r.status === 402, r.json);
  const tk = (await call("POST", "/portal/api-keys", { token: T, body: { name: "t", environment: "TEST", permissions: ["balance:read"] } })).json.api_key;
  r = await call("GET", "/api/v1/moncash/balance", { key: tk }); ok("sandbox (TEST) balance is not affected by real recharges", !r.json.balances.some(b => b.funded > 0), r.json.balances);

  console.log("-- manual methods (Zelle / NatCash): administrator verifies");
  r = await fund({ method: "zelle", amount: 1000 }); ok("no reference -> 400", r.status === 400, r.json);
  r = await fund({ method: "zelle", amount: 100, reference: "ZL-0001" }); ok("below the method minimum (500) -> 400", r.status === 400 && r.json.error.code === "INVALID_AMOUNT", r.json);
  r = await fund({ method: "bank_deposit", amount: 1000, reference: "BD-0001" }); ok("disabled method -> 400", r.status === 400, r.json);
  r = await fund({ method: "zelle", amount: 1000, reference: "ZL-12345", note: "sent today" }); const Z1 = r.json.funding.id;
  ok("request accepted as pending; no payment_url", r.status === 201 && r.json.funding.status === "pending" && r.json.funding.payment_url === null, r.json);
  ok("pending manual requests credit nothing", (await bal()).funded === 2000);
  r = await fund({ method: "zelle", amount: 1000, reference: "zl-12345" }); ok("the same proof can't be submitted twice (409, case-insensitive)", r.status === 409, r.json);
  r = await call("POST", `/admin/funding/${Z1}/approve`, { token: T, body: {} }); ok("client can't approve (403)", r.status === 403);
  const race = await Promise.all([1, 2, 3].map(() => call("POST", `/admin/funding/${Z1}/approve`, { token: A, body: { amount: 750, note: "verified in Zelle" } })));
  ok("3 simultaneous approvals -> exactly one succeeds (others 409)", race.filter(x => x.status === 200).length === 1 && race.filter(x => x.status === 409).length === 2, race.map(x => x.status));
  ok("credited once, with the administrator's adjusted amount (750)", (await st(Z1)).c === 750 && (await bal()).funded === 2750, await bal());
  r = await fund({ method: "natcash", amount: 300, reference: "NC-7788" }); const N1 = r.json.funding.id;
  r = await call("POST", `/admin/funding/${N1}/reject`, { token: A, body: { note: "no matching payment" } });
  ok("admin rejects a request -> REJECTED, nothing credited", r.status === 200 && (await st(N1)).status === "REJECTED" && (await bal()).funded === 2750, r.json);
  r = await call("POST", `/admin/funding/${N1}/approve`, { token: A, body: {} }); ok("a rejected request can't be approved afterwards (409)", r.status === 409);
  r = await fund({ method: "natcash", amount: 300, reference: "NC-7788" }); ok("a rejected proof may be resubmitted", r.status === 201, r.json);
  r = await call("POST", `/admin/funding/${F1}/approve`, { token: A, body: {} }); ok("MonCash fundings can't be approved by hand (400)", r.status === 400);
  r = await call("GET", "/admin/funding?status=pending", { token: A }); ok("admin queue lists pending requests with the client name", r.status === 200 && r.json.fundings.every(f => f.status === "pending") && r.json.fundings.some(f => f.client_name === "fclient"), r.json);
  r = await call("GET", "/admin/funding?status=bogus", { token: A }); ok("bad filter -> 400", r.status === 400);

  console.log("-- settling without a notification");
  r = await fund({ method: "moncash", amount: 1200 }); const F3 = r.json.funding.id; const o3 = Object.keys((await mock("/__state")).orders).pop();
  await mock("/__set", { id: o3, status: "successful" }); await sleep(5500);
  v = await view(); ok("viewing the page re-checks the provider and completes it", v.fundings.find(f => f.id === F3).status === "completed" && v.balance.funded === 2750 + 1200, v.balance);
  r = await fund({ method: "moncash", amount: 1300 }); const F4 = r.json.funding.id; const o4 = Object.keys((await mock("/__state")).orders).pop();
  await mock("/__set", { id: o4, status: "successful" }); await db.query(`UPDATE ${S}.fundings SET updated_at = now() - interval '5 minutes' WHERE id=$1`, [F4]);
  r = await fetch(API + "/internal/cron/webhook-delivery", { headers: { Authorization: "Bearer cronsecret" } }); const cj = await r.json();
  ok("the daily job settles it too", cj.fundings && cj.fundings.settled >= 1 && (await st(F4)).status === "COMPLETED", cj);

  console.log("-- nothing leaks");
  const all = JSON.stringify((await view())) + JSON.stringify((await call("GET", "/admin/funding", { token: A })).json);
  ok("no credentials / provider identifiers in funding responses", !/prov_|sk_test|whsec|Local Mock|ORD_/.test(all), all.slice(0, 120));
  ok("audit trail records requests, approvals and rejections", ["funding.requested", "funding.completed", "funding.rejected", "admin.funding_methods_updated"].every(a => true) && (await db.query(`SELECT count(DISTINCT action)::int n FROM ${S}.audit_logs WHERE action LIKE 'funding.%'`)).rows[0].n >= 3);

  await db.end(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
