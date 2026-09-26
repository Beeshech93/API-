// Integration test — run with `npm run test:e2e` (see e2e/README.md). Needs E2E_DATABASE_URL.
const { DB_URL, SCHEMA, withSchema, ROOT } = require("./env");
const S = SCHEMA;
const { Client } = require("pg");
const API = "http://localhost:4100";
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  ", n); } else { fail++; console.log("  FAIL", n, x !== undefined ? JSON.stringify(x) : ""); } };
async function call(method, path, { token, body } = {}) {
  const res = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: res.status, json: j, raw: t };
}
(async () => {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  const stamp = Date.now();
  const mk = async (l) => (await call("POST", "/auth/signup", { body: { services: ["receive", "send"], email: `${l}${stamp}@example.com`, password: "Str0ng-Passw0rd!", name: l } })).json;
  const a = await mk("cfgadmin"); await db.query(`UPDATE ${S}.users SET role='ADMIN' WHERE id=$1`, [a.user.id]);
  const A = (await call("POST", "/auth/login", { body: { email: `cfgadmin${stamp}@example.com`, password: "Str0ng-Passw0rd!" } })).json.access_token;
  const user = await mk("cfguser");

  let r = await call("GET", "/admin/providers/config", { token: user.access_token });
  ok("non-admin can't read the connection config (403)", r.status === 403);
  r = await call("PUT", "/admin/providers/config", { token: user.access_token, body: { apiKey: "x" } });
  ok("non-admin can't write it (403)", r.status === 403);

  r = await call("GET", "/admin/providers/config", { token: A });
  ok("starts unconfigured", r.json.config.configured === false && r.json.config.source === "none", r.json);

  const SECRET_KEY = "sk_super_secret_value_9f3a", API_KEY = "ak_live_0123456789abcdef", WH = "whsec_provider_topsecret";
  r = await call("PUT", "/admin/providers/config", { token: A, body: { name: "Acme Pay", apiUrl: "http://169.254.169.254/x", apiKey: API_KEY, secretKey: SECRET_KEY } });
  ok("provider URL pointing at an internal address is rejected (SSRF)", r.status === 400, r.json);
  r = await call("PUT", "/admin/providers/config", { token: A, body: { name: "Acme Pay", apiUrl: "https://93.184.216.34/api", apiKey: API_KEY, secretKey: SECRET_KEY, webhookSecret: WH } });
  ok("admin saves the connection manually", r.status === 200 && r.json.config.configured === true && r.json.config.source === "admin", r.json);
  ok("response has masked secrets only (last 4)", r.json.config.api_key.endsWith("cdef") && r.json.config.secret_key.endsWith("9f3a") && r.json.config.webhook_secret.endsWith("cret"));
  ok("response never contains any secret in full", ![API_KEY, SECRET_KEY, WH].some(s => r.raw.includes(s)));
  r = await call("GET", "/admin/providers/config", { token: A });
  ok("GET also masked, never returns secrets", ![API_KEY, SECRET_KEY, WH].some(s => r.raw.includes(s)) && r.json.config.name === "Acme Pay");

  const row = (await db.query(`SELECT value::text AS v FROM ${S}.platform_settings WHERE key='provider_connection'`)).rows[0].v;
  ok("secrets are ENCRYPTED in the database (no plaintext)", !row.includes(SECRET_KEY) && !row.includes(API_KEY) && !row.includes(WH) && row.includes('"secrets"'), row.slice(0, 120));

  r = await call("PUT", "/admin/providers/config", { token: A, body: { apiUrl: "https://93.184.216.34/v2" } });
  ok("changing only the URL keeps the stored secrets", r.json.config.configured === true && r.json.config.api_url.endsWith("/v2") && r.json.config.secret_key.endsWith("9f3a"), r.json);
  r = await call("POST", "/admin/providers/check", { token: A });
  const p = r.json.providers.find(x => x.code === "primary");
  ok("providers list shows the admin-entered name + configured, no secrets", p.name === "Acme Pay" && p.credentials === "configured" && ![API_KEY, SECRET_KEY, WH].some(s => r.raw.includes(s)), p);
  const pub = await call("GET", "/api/v1/health");
  ok("public API never exposes the provider name", !/acme pay/i.test(pub.raw));

  // a LIVE client sees only the generic error, never the provider
  await db.query(`UPDATE ${S}.clients SET live_enabled = true, kyc_status = 'APPROVED' WHERE id = (SELECT client_id FROM ${S}.users WHERE id=$1)`, [user.user.id]);
  const lk = (await call("POST", "/portal/api-keys", { token: user.access_token, body: { name: "l", environment: "LIVE", permissions: ["payments:create"] } })).json.api_key;
  const lr = await fetch(API + "/api/v1/moncash/payments", { method: "POST", headers: { Authorization: `Bearer ${lk}`, "Idempotency-Key": "k1", "Content-Type": "application/json" }, body: JSON.stringify({ amount: 1000, currency: "HTG", phone: "50937123456" }) });
  const lt = await lr.text();
  ok("LIVE payment still fails closed with a generic message, no provider name/secrets", lr.status === 502 && !/acme pay/i.test(lt) && !lt.includes(SECRET_KEY), lt);

  r = await call("GET", "/admin/audit-logs", { token: A });
  const cfgLogs = r.json.logs.filter(l => l.action.startsWith("admin.provider_config"));
  ok("audited (field names only, no values)", cfgLogs.length >= 2 && !JSON.stringify(cfgLogs).includes(SECRET_KEY) && !JSON.stringify(cfgLogs).includes(API_KEY), cfgLogs.map(l => l.metadata));

  r = await call("DELETE", "/admin/providers/config", { token: A });
  ok("admin can clear the connection", r.status === 200 && r.json.config.configured === false, r.json);
  await db.end();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
