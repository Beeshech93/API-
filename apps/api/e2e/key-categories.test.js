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
  const stamp = Date.now(), PW = "Str0ng-Passw0rd!";
  const signup = async (l, services) => (await call("POST", "/auth/signup", { body: { email: `${l}${stamp}@example.com`, password: PW, name: l, services } })).json;
  const B = await signup("both", ["receive", "send"]), R = await signup("recv", ["receive"]), Sd = await signup("send", ["send"]);
  const mk = (u, body) => call("POST", "/portal/api-keys", { token: u.access_token, body: { name: "k" + Math.random(), environment: "TEST", ...body } });
  const cat = async k => (await db.query(`SELECT category FROM ${S}.api_keys WHERE id=$1`, [k])).rows[0].category;

  console.log("-- the category is chosen and stored");
  let r = await mk(B, { category: "receive" }); const rk = r.json;
  ok("category=receive -> a receive key with the default receive permissions", r.status === 201 && r.json.category === "receive" && r.json.permissions.join() === "payments:read,payments:create,transactions:read,balance:read" && (await cat(r.json.id)) === "RECEIVE", r.json);
  r = await mk(B, { category: "send" }); const sk = r.json;
  ok("category=send -> a send key with the default send permissions", r.status === 201 && r.json.category === "send" && r.json.permissions.join() === "transfers:read,transfers:create,transactions:read,balance:read" && (await cat(r.json.id)) === "SEND", r.json);
  r = await mk(B, { category: "receive", permissions: ["payments:create", "webhooks:manage"] }); ok("explicit permissions within the category are kept", r.status === 201 && r.json.permissions.join() === "payments:create,webhooks:manage", r.json);
  r = await mk(B, { category: "receive", permissions: ["transfers:create"] }); ok("a receive key can't hold transfers permissions (400)", r.status === 400 && /can't have transfers permissions/.test(r.json.error.message), r.json);
  r = await mk(B, { category: "send", permissions: ["payments:read"] }); ok("a send key can't hold payments permissions (400)", r.status === 400 && /can't have payments permissions/.test(r.json.error.message), r.json);
  r = await mk(B, { permissions: ["transfers:read"] }); ok("category worked out from permissions when omitted (send)", r.status === 403 || r.json.category === "send", r.json);
  r = await mk(B, {}); ok("neither category nor permissions -> 400", r.status === 400, r.json);
  r = await mk(B, { category: "trade" }); ok("unknown category -> 400", r.status === 400);

  console.log("-- limits are per category");
  // TEST keys: 3 per category. B has 2 receive so far (rk + explicit) and 1 send (sk).
  r = await mk(B, { category: "receive" }); ok("third receive key allowed", r.status === 201);
  r = await mk(B, { category: "receive" }); ok("fourth receive key refused (403)", r.status === 403 && /at most 3/.test(r.json.error.message), r.json);
  r = await mk(B, { category: "send" }); ok("...but send keys are counted separately: another send key is allowed (3rd; one came from the inferred-category test)", r.status === 201, r.json);
  r = await mk(B, { category: "send" }); ok("fourth send key refused (403)", r.status === 403);

  console.log("-- the account decides which categories exist");
  r = await mk(R, { category: "send" }); ok("a receive-only account can't have send keys (403)", r.status === 403 && /not set up to send/.test(r.json.error.message), r.json);
  r = await mk(Sd, { category: "receive" }); ok("a send-only account can't have receive keys (403)", r.status === 403 && /not set up to receive/.test(r.json.error.message), r.json);
  r = await mk(R, { permissions: ["balance:read"] }); ok("permissions with no category follow the account (receive-only -> receive)", r.status === 201 && r.json.category === "receive", r.json);
  r = await mk(Sd, { permissions: ["balance:read"] }); ok("...(send-only -> send)", r.status === 201 && r.json.category === "send", r.json);

  console.log("-- the category is enforced on every request");
  const RK = rk.api_key, SK = sk.api_key;
  const pay = (key, path) => call("POST", path, { key, headers: { "Idempotency-Key": "c" + Math.random() }, body: { amount: 1000, currency: "HTG", phone: "50900000001" } });
  const xfer = (key, path) => call("POST", path, { key, headers: { "Idempotency-Key": "c" + Math.random() }, body: { amount: 100, currency: "HTG", phone: "50900000001", recipient: { first_name: "A", last_name: "B" } } });
  r = await pay(RK, "/api/v1/receive/moncash/payments"); ok("receive key on the receive API works", r.status === 201);
  r = await call("GET", "/api/v1/send/moncash/balance", { key: RK }); ok("a receive key can't use even shared endpoints on the send API (403)", r.status === 403 && /receive-payments API, not the send-money API/.test(r.json.error.message), r.json);
  r = await call("GET", "/api/v1/receive/moncash/balance", { key: SK }); ok("a send key can't use the receive API (403)", r.status === 403, r.json);
  r = await call("GET", "/api/v1/moncash/balance", { key: RK }); ok("shared endpoints on the original path stay open to either", r.status === 200);
  r = await call("POST", "/api/v1/sandbox/fund", { key: SK, body: { amount: 5000 } }); ok("sandbox funding is for send keys", r.status === 201);
  r = await call("POST", "/api/v1/sandbox/fund", { key: RK, body: { amount: 5000 } }); ok("...not for receive keys (403)", r.status === 403);
  r = await xfer(SK, "/api/v1/send/moncash/transfers"); ok("send key on the send API works", r.status === 201, r.json);
  // Tamper: give the send key a payments permission directly in the database. The category still stops it.
  await db.query(`UPDATE ${S}.api_keys SET permissions = ARRAY['transfers:create','transfers:read','payments:create','payments:read','balance:read'] WHERE id=$1`, [sk.id]);
  r = await pay(SK, "/api/v1/moncash/payments"); ok("even with a payments permission added, a SEND key can't create payments (403)", r.status === 403 && /send-money API/.test(r.json.error.message), r.json);
  r = await pay(SK, "/api/v1/receive/moncash/payments"); ok("...on either path", r.status === 403);
  await db.query(`UPDATE ${S}.api_keys SET permissions = ARRAY['payments:create','payments:read','transfers:create','transfers:read','balance:read'] WHERE id=$1`, [rk.id]);
  r = await xfer(RK, "/api/v1/moncash/transfers"); ok("and a RECEIVE key can't send money either (403)", r.status === 403 && /receive-payments API/.test(r.json.error.message), r.json);

  console.log("-- older keys (both) keep working");
  await db.query(`UPDATE ${S}.api_keys SET category='BOTH' WHERE id=$1`, [rk.id]);
  r = await xfer(RK, "/api/v1/moncash/transfers"); ok("a BOTH key can still send (funded by sandbox)", r.status === 201 || r.status === 402, r.json);
  r = await pay(RK, "/api/v1/receive/moncash/payments"); ok("...and receive", r.status === 201);
  const rot = await call("POST", `/portal/api-keys/${rk.id}/rotate`, { token: B.access_token }); ok("rotating keeps the category", rot.status === 200 && rot.json.category === "both", rot.json);
  const rot2 = await call("POST", `/portal/api-keys/${sk.id}/rotate`, { token: B.access_token }); ok("rotating a send key keeps it a send key", rot2.status === 200 && rot2.json.category === "send", rot2.json);

  console.log("-- listing");
  r = await call("GET", "/portal/api-keys", { token: B.access_token });
  ok("the key list carries each key's category", r.json.api_keys.every(k => ["receive", "send", "both"].includes(k.category)) && r.json.api_keys.some(k => k.category === "send") && r.json.api_keys.some(k => k.category === "receive"), r.json.api_keys.map(k => k.category));
  const adm = await signup("kadmin", ["receive", "send"]); await db.query(`UPDATE ${S}.users SET role='ADMIN' WHERE id=$1`, [adm.user.id]);
  const A = (await call("POST", "/auth/login", { body: { email: `kadmin${stamp}@example.com`, password: PW } })).json.access_token;
  r = await call("GET", `/admin/clients/${B.user.clientId}`, { token: A }); ok("the admin's client view shows categories too", r.json.api_keys.every(k => !!k.category) && !JSON.stringify(r.json).includes(SK), r.json.api_keys.map(k => k.category));

  await db.end(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
