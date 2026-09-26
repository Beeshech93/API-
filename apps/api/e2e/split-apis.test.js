// Integration test — run with `npm run test:e2e` (see e2e/README.md). Needs E2E_DATABASE_URL.
const { DB_URL, SCHEMA, withSchema, ROOT } = require("./env");
const { Client } = require("pg"); const fs = require("fs");
const API = "http://localhost:4100", S = SCHEMA;
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  ", n); } else { fail++; console.log("  FAIL", n, x !== undefined ? JSON.stringify(x).slice(0, 380) : ""); } };
async function call(method, path, { token, key, body, headers = {} } = {}) {
  const res = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token || key ? { Authorization: `Bearer ${token || key}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: res.status, json: j, headers: res.headers };
}
(async () => {
  const db = new Client({ connectionString: DB_URL }); await db.connect();
  const stamp = Date.now();
  const su = (await call("POST", "/auth/signup", { body: { email: `split${stamp}@example.com`, password: "Str0ng-Passw0rd!", name: "Split", services: ["receive", "send"] } })).json; const T = su.access_token;
  const mk = async perms => call("POST", "/portal/api-keys", { token: T, body: { name: "k" + Math.random(), environment: "TEST", permissions: perms } });

  console.log("-- keys are for one API only");
  let r = await mk(["payments:create", "transfers:create"]); ok("a key can't carry both receive and send permissions (400)", r.status === 400 && /either for the receive-payments API or for the send-money API/.test(r.json.error.message), r.json);
  r = await mk(["payments:read", "transfers:read"]); ok("...not even read permissions (400)", r.status === 400);
  const rk = (await mk(["payments:create", "payments:read", "transactions:read", "balance:read"])).json.api_key;
  const sk = (await mk(["transfers:create", "transfers:read", "transactions:read", "balance:read"])).json.api_key;
  ok("a receive key and a send key are created separately", !!rk && !!sk && rk !== sk);
  r = await mk(["balance:read", "transactions:read", "webhooks:manage"]); ok("shared permissions (balance, transactions, webhooks) fit either", r.status === 201);
  await call("DELETE", `/portal/api-keys/${r.json.id}`, { token: T }); // keep within the TEST key limit

  console.log("-- receive API: /api/v1/receive/...");
  const create = (base, key, idem, phone = "50900000001") => call("POST", `${base}`, { key, headers: { "Idempotency-Key": idem }, body: { amount: 1000, currency: "HTG", phone } });
  r = await create("/api/v1/receive/moncash/payments", rk, "p1"); const P = r.json.transaction_id;
  ok("create a payment", r.status === 201 && r.json.type === "payment" && r.json.status === "completed", r.json);
  r = await call("GET", `/api/v1/receive/moncash/payments/${P}`, { key: rk }); ok("read it", r.status === 200 && r.json.transaction_id === P);
  r = await call("GET", "/api/v1/receive/moncash/payments", { key: rk }); ok("list payments", r.status === 200 && r.json.payments.length === 1 && r.json.payments.every(p => p.type === "payment"), r.json);
  r = await create("/api/v1/receive/natcash/payments", rk, "p2"); ok("NatCash works in the sandbox too", r.status === 201);
  r = await create("/api/v1/receive/moncash/transfers", rk, "x0"); ok("the receive API has no transfers (404)", r.status === 404, r.json);
  r = await call("GET", "/api/v1/receive/moncash/transfers", { key: rk }); ok("...not even to read them (404)", r.status === 404);
  r = await call("GET", "/api/v1/receive/moncash/balance", { key: rk }); ok("balance is there", r.status === 200 && r.json.balances[0].collected === 2000, r.json);

  console.log("-- send API: /api/v1/send/...");
  r = await create("/api/v1/send/moncash/payments", sk, "p3"); ok("the send API has no payments (404)", r.status === 404, r.json);
  r = await call("GET", "/api/v1/send/moncash/payments", { key: sk }); ok("...not even to read them (404)", r.status === 404);
  const xfer = (key, idem) => call("POST", "/api/v1/send/moncash/transfers", { key, headers: { "Idempotency-Key": idem }, body: { amount: 400, currency: "HTG", phone: "50900000001", recipient: { first_name: "A", last_name: "B" } } });
  r = await xfer(sk, "t1"); const X = r.json.transaction_id; ok("create a transfer", r.status === 201 && r.json.type === "transfer" && r.json.status === "completed", r.json);
  r = await call("GET", `/api/v1/send/moncash/transfers/${X}`, { key: sk }); ok("read it", r.status === 200 && r.json.transaction_id === X);
  r = await call("GET", "/api/v1/send/moncash/transfers", { key: sk }); ok("list transfers", r.status === 200 && r.json.transfers.length === 1);
  r = await call("GET", "/api/v1/send/natcash/balance", { key: sk }); ok("balance: what can be sent (2000 - 20 fees - 400 - 4 = 1576)", r.status === 200 && r.json.balances[0].available === 1576, r.json.balances);

  console.log("-- each API only sees its own kind of transaction");
  r = await call("GET", `/api/v1/receive/moncash/transactions/${X}`, { key: rk }); ok("a transfer id isn't visible through the receive API (404)", r.status === 404);
  r = await call("GET", `/api/v1/send/moncash/transactions/${P}`, { key: sk }); ok("a payment id isn't visible through the send API (404)", r.status === 404);
  r = await call("GET", "/api/v1/receive/moncash/transactions", { key: rk }); ok("receive: transactions are payments only", r.json.transactions.every(t => t.type === "payment") && r.json.transactions.length === 1, r.json.transactions.map(t => t.type));
  r = await call("GET", "/api/v1/send/moncash/transactions?type=payment", { key: sk }); ok("send: transactions are transfers only (a type filter can't widen it)", r.json.transactions.every(t => t.type === "transfer") && r.json.transactions.length === 1, r.json.transactions.map(t => t.type));
  r = await call("GET", `/api/v1/receive/moncash/payments/${X}`, { key: rk }); ok("a transfer id isn't a payment (404)", r.status === 404);

  console.log("-- permissions still decide");
  r = await create("/api/v1/receive/moncash/payments", sk, "p4"); ok("a send key can't create payments even on the receive path (403)", r.status === 404 || r.status === 403);
  r = await xfer(rk, "t2"); ok("a receive key can't send money (403)", r.status === 403 && /receive-payments API, not the send-money API/.test(r.json.error.message), r.json);
  r = await call("GET", "/api/v1/quote?amount=1000&currency=HTG&provider=moncash", { key: sk }); ok("quotes work for both kinds of key", r.status === 200 && r.json.fee === 10);
  r = await call("GET", "/api/v1/quote?amount=1000&currency=HTG&provider=moncash", { key: rk }); ok("...", r.status === 200);
  r = await call("POST", `/api/v1/sandbox/transactions/${P}/simulate`, { key: rk, body: { outcome: "completed" } }); ok("sandbox simulate accepts either kind (already completed -> 409)", r.status === 409, r.json);

  console.log("-- existing integrations keep working");
  r = await create("/api/v1/moncash/payments", rk, "leg1"); ok("legacy POST /api/v1/moncash/payments", r.status === 201, r.json);
  r = await call("POST", "/api/v1/moncash/transfers", { key: sk, headers: { "Idempotency-Key": "leg3" }, body: { amount: 100, currency: "HTG", phone: "50900000001", recipient: { first_name: "A", last_name: "B" } } }); ok("legacy POST /api/v1/moncash/transfers", r.status === 201, r.json);
  const legacy = await mk(["balance:read"]);
  await db.query(`UPDATE ${S}.api_keys SET category='BOTH', permissions = ARRAY['payments:create','transfers:create','transactions:read','balance:read'] WHERE id=$1`, [legacy.json.id]);
  r = await create("/api/v1/moncash/payments", legacy.json.api_key, "leg4"); ok("a key created before the split with both permission sets keeps working: payments", r.status === 201, r.json);
  r = await call("POST", "/api/v1/send/moncash/transfers", { key: legacy.json.api_key, headers: { "Idempotency-Key": "leg5" }, body: { amount: 100, currency: "HTG", phone: "50900000001", recipient: { first_name: "A", last_name: "B" } } }); ok("...and transfers", r.status === 201, r.json);
  r = await call("POST", `/portal/api-keys/${legacy.json.id}/rotate`, { token: T }); ok("...and it can be rotated as is", r.status === 200 && !!r.json.api_key, r.json);

  await db.end(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
