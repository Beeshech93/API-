// Integration test — run with `npm run test:e2e` (see e2e/README.md). Needs E2E_DATABASE_URL.
const { DB_URL, SCHEMA, withSchema, ROOT } = require("./env");
const S = SCHEMA;
const { Client } = require("pg"); const crypto = require("crypto"); const fs = require("fs");
const API = "http://localhost:4100", MOCK = "http://localhost:4300";
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  ", n); } else { fail++; console.log("  FAIL", n, x !== undefined ? JSON.stringify(x).slice(0, 400) : ""); } };
async function call(method, path, { token, key, body, headers = {}, rawBody } = {}) {
  const res = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token || key ? { Authorization: `Bearer ${token || key}` } : {}), ...headers }, body: rawBody ?? (body ? JSON.stringify(body) : undefined) });
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: res.status, json: j, raw: t };
}
const mock = async (p, body) => (await fetch(MOCK + p, { method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined })).json();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WH = "whsec_local_secret";
const signed = (payload, { secret = WH, ts = Math.floor(Date.now() / 1000), evt = "evt_" + crypto.randomBytes(4).toString("hex") } = {}) => {
  const raw = JSON.stringify(payload);
  return { rawBody: raw, headers: { "x-mock-timestamp": String(ts), "x-mock-event-id": evt, "x-mock-signature": "v1=" + crypto.createHmac("sha256", secret).update(`${ts}.${evt}.${raw}`).digest("hex") } };
};
var r0;
(async () => {
  const url = DB_URL;
  const db = new Client({ connectionString: url }); await db.connect();
  await db.query(`DELETE FROM ${S}.platform_settings WHERE key='provider_connection'`);
  await db.query(`TRUNCATE ${S}.transactions, ${S}.audit_logs CASCADE`);
  const stamp = Date.now(); const PW = "Str0ng-Passw0rd!";
  const su = async (l) => (await call("POST", "/auth/signup", { body: { services: ["receive", "send"], email: `${l}${stamp}@example.com`, password: PW, name: l } })).json;
  const adm = await su("lvadmin"); await db.query(`UPDATE ${S}.users SET role='ADMIN' WHERE id=$1`, [adm.user.id]);
  const A = (await call("POST", "/auth/login", { body: { email: `lvadmin${stamp}@example.com`, password: PW } })).json.access_token;
  const cl = await su("lvclient"); const T = cl.access_token;
  const ALL = ["payments:create", "payments:read", "transactions:read", "balance:read", "transfers:create", "transfers:read"];
  const denied = await call("POST", "/portal/api-keys", { token: T, body: { name: "early", environment: "LIVE", permissions: ["payments:create"] } });
  ok("LIVE key refused before approval", denied.status === 403, denied);
  await db.query(`UPDATE ${S}.clients SET kyc_status='APPROVED' WHERE id=(SELECT client_id FROM ${S}.users WHERE id=$1)`, [cl.user.id]);
  r0 = await call("POST", `/admin/clients/${(await db.query(`SELECT client_id FROM ${S}.users WHERE id=$1`, [cl.user.id])).rows[0].client_id}/live-access`, { token: A, body: { enabled: true } });
  ok("admin enables LIVE access for the client", r0.status === 200 && r0.json.live_enabled === true, r0);
  const kr = await call("POST", "/portal/api-keys", { token: T, body: { name: "live", environment: "LIVE", permissions: ["payments:create", "payments:read", "transactions:read", "balance:read"] } });
  const skr = await call("POST", "/portal/api-keys", { token: T, body: { name: "live-send", environment: "LIVE", permissions: ["transfers:create", "transfers:read", "transactions:read", "balance:read"] } });
  const sendKey = skr.json.api_key;
  const key = kr.json.api_key; if (!key) { console.log("key creation failed", kr.raw); process.exit(2); }
  const pay = (net, body, idem) => call("POST", `/api/v1/${net}/payments`, { key, headers: { "Idempotency-Key": idem }, body: { currency: "HTG", phone: "50937123456", ...body } });
  const xfer = (net, body, idem) => call("POST", `/api/v1/${net}/transfers`, { key: sendKey, headers: { "Idempotency-Key": idem }, body: { currency: "HTG", phone: "50937123456", recipient: { first_name: "Melissa", last_name: "Francois" }, ...body } });
  const bal = async (net = "moncash") => (await call("GET", `/api/v1/${net}/balance`, { key })).json.balances[0] || { available: 0, collected: 0 };
  const dbStatus = async id => (await db.query(`SELECT status, error_code FROM ${S}.transactions WHERE id=$1`, [id])).rows[0];
  const count = async () => (await db.query(`SELECT count(*)::int n FROM ${S}.transactions`)).rows[0].n;

  console.log("-- not configured: fails closed, creates nothing");
  let r = await pay("moncash", { amount: 1000 }, "n1");
  ok("LIVE payment before the connection exists -> 502 PROVIDER_ERROR", r.status === 502 && r.json.error.code === "PROVIDER_ERROR", r);
  ok("no transaction row was created", (await count()) === 0);

  console.log("-- admin enters the connection");
  r = await call("PUT", "/admin/providers/config", { token: A, body: { name: "Local Mock", apiUrl: MOCK, apiKey: "prov_test_user", secretKey: "sk_test_secret", webhookSecret: WH } });
  ok("saved", r.status === 200 && r.json.config.configured, r);
  r = await call("POST", "/admin/providers/check", { token: A });
  const prim = r.json.providers.find(p => p.code === "primary");
  ok("connection test authenticates and reads the wallet", prim.status === "operational" && /wallet 500000/.test(prim.message || ""), prim);
  await call("PUT", "/admin/providers/config", { token: A, body: { secretKey: "wrong-secret" } });
  r = await call("POST", "/admin/providers/check", { token: A });
  ok("wrong credentials -> reported as failed", r.json.providers.find(p => p.code === "primary").status !== "operational");
  await call("PUT", "/admin/providers/config", { token: A, body: { secretKey: "sk_test_secret" } });

  console.log("-- validation before anything is created");
  const before = await count();
  r = await pay("natcash", { amount: 1000 }, "v1"); ok("NatCash payment (not offered by the provider) -> 400", r.status === 400 && r.json.error.code === "INVALID_REQUEST", r);
  r = await pay("moncash", { amount: 1000, currency: "USD" }, "v2"); ok("USD in LIVE -> 400", r.status === 400, r);
  r = await pay("moncash", { amount: 80000 }, "v3"); ok("above the 75,000 payment limit -> 400", r.status === 400, r);
  r = await xfer("moncash", { amount: 100, recipient: undefined }, "v4"); ok("transfer without recipient -> 400", r.status === 400 && /recipient/.test(r.json.error.message), r);
  ok("nothing created for rejected requests", (await count()) === before);

  console.log("-- receiving a payment");
  await mock("/__reset", {});
  r = await pay("moncash", { amount: 1000, reference: "ORDER-1", description: "Test order", success_url: "https://shop.example/ok", error_url: "https://shop.example/err" }, "p1");
  const P1 = r.json.transaction_id;
  ok("201 pending with a payment_url", r.status === 201 && r.json.status === "pending" && /^https:\/\/moncashbutton\.example\/redirect/.test(r.json.payment_url), r);
  let log = (await mock("/__state")).log;
  const created = log.find(l => l.path === "/moncash/token");
  ok("provider got amount, our txn id as reference, userID, return URLs and our webhook URL", created.body.gdes === 1000 && created.body.referenceId === P1 && created.body.userID === "prov_test_user" && created.body.successUrl === "https://shop.example/ok" && created.body.webhookUrl === "https://api.example.test/webhooks/provider", created.body);
  ok("request carried a bearer token", created.auth === true);
  ok("payer phone is NOT sent to the provider", !JSON.stringify(created.body).includes("37123456"));
  const orderId = Object.keys((await mock("/__state")).orders).pop();
  r = await call("GET", `/api/v1/moncash/transactions/${P1}`, { key }); ok("still pending while the provider says pending", r.json.status === "pending");
  ok("no funds credited yet", (await bal()).collected === 0);

  console.log("-- provider notification: verified, then re-read from the provider");
  await mock("/__set", { id: orderId, status: "successful" });
  let w = signed({ type: "payment.succeeded", orderId, status: "successful" }, { secret: "not-the-secret" });
  r = await call("POST", "/webhooks/provider", { headers: w.headers, rawBody: w.rawBody }); ok("bad signature -> 401", r.status === 401, r);
  ok("...and the payment is untouched", (await dbStatus(P1)).status === "PENDING");
  w = signed({ type: "payment.succeeded", orderId }, { ts: Math.floor(Date.now() / 1000) - 3600 });
  r = await call("POST", "/webhooks/provider", { headers: w.headers, rawBody: w.rawBody }); ok("stale timestamp (replay) -> 401", r.status === 401, r);
  r = await call("POST", "/webhooks/provider", { rawBody: JSON.stringify({ orderId }) }); ok("unsigned -> 401", r.status === 401);
  w = signed({ type: "payment.succeeded", orderId, status: "successful" });
  r = await call("POST", "/webhooks/provider", { headers: w.headers, rawBody: w.rawBody });
  ok("valid signature -> 200 and payment COMPLETED", r.status === 200 && (await dbStatus(P1)).status === "COMPLETED", r);
  r = await call("POST", "/webhooks/provider", { headers: w.headers, rawBody: w.rawBody });
  ok("same notification again is harmless", r.status === 200 && (await dbStatus(P1)).status === "COMPLETED");
  const ev = (await db.query(`SELECT count(*)::int n FROM ${S}.transaction_events WHERE transaction_id=$1 AND status='COMPLETED'`, [P1])).rows[0].n;
  ok("exactly one COMPLETED event (no duplicates)", ev === 1, ev);
  let b = await bal(); ok("client balance credited: 1000 collected, 10 fees", b.collected === 1000 && b.fees === 10 && b.available === 990, b);

  console.log("-- a notification can't complete a payment for a different amount");
  r = await pay("moncash", { amount: 500 }, "p2"); const P2 = r.json.transaction_id;
  const order2 = Object.keys((await mock("/__state")).orders).pop();
  await mock("/__set", { id: order2, status: "successful", amount: 100 });
  w = signed({ type: "payment.succeeded", orderId: order2 }); await call("POST", "/webhooks/provider", { headers: w.headers, rawBody: w.rawBody });
  ok("amount mismatch -> stays PENDING", (await dbStatus(P2)).status === "PENDING");
  ok("mismatch is audited", (await db.query(`SELECT count(*)::int n FROM ${S}.audit_logs WHERE action='provider.amount_mismatch'`)).rows[0].n === 1);
  await mock("/__set", { id: order2, status: "failed", amount: 500 });
  w = signed({ type: "payment.failed", orderId: order2 }); await call("POST", "/webhooks/provider", { headers: w.headers, rawBody: w.rawBody });
  r = await call("GET", `/api/v1/moncash/transactions/${P2}`, { key });
  ok("provider says failed -> FAILED with a generic error", r.json.status === "failed" && r.json.error.code === "TRANSACTION_FAILED", r.json);
  ok("failed payment credits nothing", (await bal()).collected === 1000);

  console.log("-- sending money");
  r = await xfer("moncash", { amount: 400, reference: "PAYOUT-1", description: "Weekly" }, "t1"); const T1 = r.json.transaction_id;
  ok("transfer accepted (pending)", r.status === 201 && r.json.type === "transfer" && r.json.status === "pending", r);
  log = (await mock("/__state")).log; const tc = log.filter(l => l.path === "/moncash/transfers").pop();
  ok("provider got 8-digit wallet, recipient names and our txn id", tc.body.wallet === "37123456" && tc.body.customerFirstName === "Melissa" && tc.body.customerLastName === "Francois" && tc.body.referenceId === T1 && tc.body.gdes === 400, tc.body);
  b = await bal(); ok("funds reserved immediately (990 - 400 - 4 fee = 586)", b.available === 586, b);
  r = await xfer("moncash", { amount: 9000 }, "t2");
  const callsBefore = (await mock("/__state")).log.length;
  ok("more than the client's own balance -> 402, provider never called", r.status === 402 && r.json.error.code === "INSUFFICIENT_BALANCE" && (await mock("/__state")).log.length === callsBefore, r);
  const tid = Object.keys((await mock("/__state")).transfers).pop();
  await mock("/__set", { id: tid, status: "completed" });
  await sleep(5500);
  r = await call("GET", `/api/v1/moncash/transfers/${T1}`, { key: sendKey });
  ok("GET re-checks the provider and completes the transfer", r.json.status === "completed", r.json);

  r = await xfer("natcash", { amount: 100, phone: "50944556677" }, "t3");
  ok("NatCash transfer works and uses the NatCash endpoint", r.status === 201 && (await mock("/__state")).log.some(l => l.path === "/natcash/transfers" && l.body.wallet === "44556677"), r);
  ok("balance is pooled: NatCash payout drew on money collected via MonCash", (await bal("natcash")).available === 586 - 101 && (await bal("moncash")).available === (await bal("natcash")).available, await bal("natcash"));

  console.log("-- failure handling");
  r = await xfer("moncash", { amount: 50, phone: "50900000402" }, "t4");
  ok("provider refuses (wallet short) -> generic 502, no detail leaked", r.status === 502 && r.json.error.code === "PROVIDER_ERROR" && !/insufficient|funds|balance/i.test(r.json.error.message), r);
  ok("...and the reserved funds are released", (await dbStatus((await db.query(`SELECT id FROM ${S}.transactions WHERE idempotency_key='t4'`)).rows[0].id)).status === "FAILED");
  r = await xfer("moncash", { amount: 60, phone: "50900000500" }, "t5"); const T5id = (await db.query(`SELECT id FROM ${S}.transactions WHERE idempotency_key='t5'`)).rows[0].id;
  ok("provider 500 -> outcome unknown: 504", r.status === 504 && r.json.error.code === "PROVIDER_TIMEOUT", r);
  ok("...transaction stays PROCESSING", (await dbStatus(T5id)).status === "PROCESSING");
  const held = await bal(); ok("...funds stay reserved (available 485 - 60.6 = 424.4)", Math.abs(held.available - 424.4) < 0.01, held);
  r = await call("POST", `/admin/transactions/${T5id}/resolve`, { token: T, body: { outcome: "failed", note: "verified in dashboard" } }); ok("client can't resolve (403)", r.status === 403);
  r = await call("POST", `/admin/transactions/${T5id}/resolve`, { token: A, body: { outcome: "failed", note: "verified in provider dashboard: not sent" } });
  ok("admin resolves it as failed", r.status === 200 && (await dbStatus(T5id)).status === "FAILED", r);
  ok("...audited", (await db.query(`SELECT count(*)::int n FROM ${S}.audit_logs WHERE action='admin.transaction_resolved'`)).rows[0].n === 1);
  r = await call("POST", `/admin/transactions/${T5id}/resolve`, { token: A, body: { outcome: "completed", note: "trying to flip a final state" } });
  ok("a final state can't be overwritten (409)", r.status === 409, r);

  console.log("-- reconciliation");
  r = await xfer("moncash", { amount: 70 }, "t6"); const T6 = r.json.transaction_id; const t6id = Object.keys((await mock("/__state")).transfers).pop();
  await mock("/__set", { id: t6id, status: "failed" });
  r = await call("POST", "/admin/transactions/reconcile", { token: A });
  ok("admin reconcile settles it", r.status === 200 && r.json.settled >= 1 && (await dbStatus(T6)).status === "FAILED", r);
  const after = await bal(); ok("failed transfer released its funds (back to 485 - 0 reserved by t5? see next)", after.available === 485, after);
  r = await xfer("moncash", { amount: 80 }, "t7"); const t7id = Object.keys((await mock("/__state")).transfers).pop(); const T7 = r.json.transaction_id;
  await mock("/__set", { id: t7id, status: "completed" });
  await db.query(`UPDATE ${S}.transactions SET updated_at = now() - interval '5 minutes' WHERE id=$1`, [T7]);
  r = await call("GET", "/internal/cron/webhook-delivery", { headers: { authorization: "Bearer cronsecret" } });
  ok("daily job runs reconciliation and completes it", r.status === 200 && r.json.reconciled && (await dbStatus(T7)).status === "COMPLETED", r.json);

  console.log("-- abandoned payments expire");
  await call("POST", "/portal/webhooks", { token: T, body: { url: "http://localhost:4200/hook", events: ["payment.failed"] } });
  r = await pay("moncash", { amount: 700 }, "exp-1"); const EXP = r.json.transaction_id;
  await db.query(`UPDATE ${S}.transactions SET created_at = now() - interval '25 hours', updated_at = now() - interval '25 hours' WHERE id=$1`, [EXP]);
  r = await call("POST", "/admin/transactions/reconcile", { token: A });
  ok("a hosted payment nobody completed in 24 h is closed as CANCELLED", (await dbStatus(EXP)).status === "CANCELLED", r.json);
  ok("...and the client's webhook hears about it (payment.failed)", (await db.query(`SELECT count(*)::int n FROM ${S}.webhook_deliveries WHERE transaction_id=$1 AND event='payment.failed'`, [EXP])).rows[0].n === 1);
  r = await pay("moncash", { amount: 800 }, "exp-2"); const EXP2 = r.json.transaction_id; const orderExp = Object.keys((await mock("/__state")).orders).pop(); await mock("/__set", { id: orderExp, status: "successful" });
  await db.query(`UPDATE ${S}.transactions SET created_at = now() - interval '25 hours', updated_at = now() - interval '25 hours' WHERE id=$1`, [EXP2]); await call("POST", "/admin/transactions/reconcile", { token: A });
  ok("but a payment the provider says was paid is completed, never expired", (await dbStatus(EXP2)).status === "COMPLETED");

  console.log("-- token handling");
  await mock("/__revoke", {}); await mock("/__reset", {});
  r = await xfer("moncash", { amount: 20 }, "t8");
  const l2 = (await mock("/__state")).log;
  ok("expired/revoked token -> transparently re-authenticates and succeeds", r.status === 201 && l2.filter(l => l.path === "/token").length === 1 && l2.some(l => l.path === "/moncash/transfers"), { s: r.status, l: l2.map(l => l.path) });

  console.log("-- nothing leaks to clients");
  const everything = JSON.stringify((await call("GET", "/api/v1/moncash/transactions", { key })).json);
  ok("client responses contain no credentials or provider identifiers", !/prov_|sk_test|whsec|Local Mock/.test(everything), everything.slice(0, 200));
  r = await call("GET", "/admin/providers/config", { token: A });
  ok("admin config still masked", !/sk_test_secret|whsec_local_secret|prov_test_user/.test(r.raw));
  r = await call("GET", "/portal/api-logs", { token: T }); ok("client api logs clean", !/sk_test|whsec/.test(r.raw));

  console.log(`\n${pass} passed, ${fail} failed`); await db.end(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
