// Integration test — run with `npm run test:e2e` (see e2e/README.md). Needs E2E_DATABASE_URL.
const { DB_URL, SCHEMA, withSchema, ROOT } = require("./env");
const { Client } = require("pg"); const fs = require("fs");
const API = "http://localhost:4100"; const S = SCHEMA;
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  ", n); } else { fail++; console.log("  FAIL", n, x !== undefined ? JSON.stringify(x).slice(0, 300) : ""); } };
async function call(method, path, { token, key, body, headers = {} } = {}) {
  const res = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token || key ? { Authorization: `Bearer ${token || key}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: res.status, json: j, headers: res.headers, raw: t };
}
(async () => {
  const db = new Client({ connectionString: DB_URL }); await db.connect();
  const stamp = Date.now(); const PW = "Str0ng-Passw0rd!";
  const signup = async (l) => (await call("POST", "/auth/signup", { body: { services: ["receive", "send"], email: `${l}${stamp}@example.com`, password: PW, name: l } })).json;
  const admin = await signup("admin"); await db.query(`UPDATE ${S}.users SET role='ADMIN' WHERE id=$1`, [admin.user.id]);
  const A = (await call("POST", "/auth/login", { body: { email: `admin${stamp}@example.com`, password: PW } })).json.access_token;
  const cust = await signup("customer"); const CT = cust.access_token, cid = cust.user.clientId;
  const mkKey = async (env, perms = ["transactions:read", "payments:read"]) => call("POST", "/portal/api-keys", { token: CT, body: { name: env + Math.random(), environment: env, permissions: perms } });

  console.log("# LIVE access approval");
  let r = await mkKey("LIVE"); ok("new client: LIVE key refused (403)", r.status === 403 && /KYC|LIVE access/.test(r.json.error.message), r.json);
  r = await call("GET", "/portal/overview", { token: CT }); ok("client overview: live_access false", r.json.live_access === false);
  r = await call("POST", `/admin/clients/${cid}/live-access`, { token: CT, body: { enabled: true } }); ok("client can't approve itself (403)", r.status === 403);
  r = await call("POST", `/admin/clients/${cid}/live-access`, { token: A, body: { enabled: "yes" } }); ok("bad payload rejected (400)", r.status === 400, r.json);
  r = await call("POST", `/admin/clients/${cid}/live-access`, { token: A, body: { enabled: true } }); ok("LIVE can't be opened for a client who hasn't passed KYC (409)", r.status === 409 && /KYC/.test(r.json.error.message), r.json);
  await db.query(`UPDATE ${S}.clients SET kyc_status='APPROVED' WHERE id=$1`, [cid]);
  r = await call("POST", `/admin/clients/${cid}/live-access`, { token: A, body: { enabled: true } }); ok("admin enables LIVE access", r.status === 200 && r.json.live_enabled === true, r.json);
  r = await mkKey("LIVE"); const live = r.json.api_key; ok("LIVE key now allowed", r.status === 201 && /^hp_live_/.test(live), r.json);
  r = await call("GET", "/api/v1/moncash/transactions", { key: live }); ok("LIVE key authenticates (no plan or subscription needed)", r.status === 200, r.json);

  console.log("# admin views");
  r = await call("GET", "/admin/overview", { token: A });
  ok("overview: totals, live_clients, provider status; no plan/revenue fields", r.status === 200 && r.json.total_clients >= 2 && r.json.live_clients >= 1 && r.json.active_subscriptions === undefined && r.json.monthly_revenue === undefined && r.json.system_status.some(p => p.code === "primary"), r.json);
  r = await call("GET", "/admin/clients?search=customer", { token: A });
  ok("clients list shows live_enabled, no plan", r.json.clients[0].live_enabled === true && r.json.clients[0].plan === undefined, r.json.clients?.[0]);
  r = await call("GET", `/admin/clients/${cid}`, { token: A });
  ok("client detail: live_enabled, keys, usage; nothing about subscriptions", r.status === 200 && r.json.client.live_enabled === true && r.json.api_keys.length === 1 && r.json.subscription === undefined && !JSON.stringify(r.json).includes(live) && !JSON.stringify(r.json).includes("hashed"), r.json);
  for (const gone of ["/admin/plans"]) { r = await call("GET", gone, { token: A }); ok(`${gone} is gone (404)`, r.status === 404, r.status); }
  r = await call("POST", `/admin/clients/${cid}/plan`, { token: A, body: { plan_code: "STARTER" } }); ok("plan assignment is gone (404)", r.status === 404);

  console.log("# limits (global, editable)");
  r = await call("GET", "/admin/settings/limits", { token: A }); ok("defaults: 300/min, 20 keys, approval required", r.json.limits.rateLimitPerMinute === 300 && r.json.limits.maxLiveKeys === 20 && r.json.limits.requireLiveApproval === true, r.json);
  r = await call("PUT", "/admin/settings/limits", { token: CT, body: r.json.limits }); ok("non-admin can't change limits (403)", r.status === 403);
  r = await call("PUT", "/admin/settings/limits", { token: A, body: { rateLimitPerMinute: 0, maxLiveKeys: 5, requireLiveApproval: true } }); ok("invalid limit rejected (400)", r.status === 400);
  r = await call("PUT", "/admin/settings/limits", { token: A, body: { rateLimitPerMinute: 6, maxLiveKeys: 1, requireLiveApproval: true } }); ok("admin lowers limits", r.status === 200 && r.json.limits.rateLimitPerMinute === 6, r.json);
  const codes = []; for (let i = 0; i < 9; i++) codes.push((await call("GET", "/api/v1/moncash/transactions", { key: live })).status);
  ok("LIVE rate limit follows the setting: 429 after the cap", codes.includes(429) && codes[0] === 200, codes);
  r = await call("GET", "/api/v1/moncash/transactions", { key: live }); ok("429 carries Retry-After", r.status === 429 && !!r.headers.get("retry-after") && r.json.error.retry_after > 0, r.json);
  const test = await mkKey("TEST"); ok("TEST keys use their own limit (not the LIVE one)", (await call("GET", "/api/v1/moncash/transactions", { key: test.json.api_key })).status === 200);
  r = await mkKey("LIVE"); ok("max LIVE keys = 1 enforced (403)", r.status === 403 && /at most 1/.test(r.json.error.message), r.json);
  r = await call("PUT", "/admin/settings/limits", { token: A, body: { rateLimitPerMinute: 300, maxLiveKeys: 20, requireLiveApproval: false } });
  const other = await signup("open"); await db.query(`UPDATE ${S}.clients SET kyc_status='APPROVED' WHERE id=$1`, [other.user.clientId]); r = await call("POST", "/portal/api-keys", { token: other.access_token, body: { name: "x", environment: "LIVE", permissions: ["payments:read", "transactions:read"] } });
  ok("approval switched off => any client can create LIVE keys", r.status === 201, r.json);
  const otherLive = r.json.api_key;
  r = await call("GET", "/api/v1/moncash/transactions", { key: otherLive }); ok("...and their LIVE key works", r.status === 200, r.json);
  await call("PUT", "/admin/settings/limits", { token: A, body: { rateLimitPerMinute: 300, maxLiveKeys: 20, requireLiveApproval: true } });
  r = await call("GET", "/api/v1/moncash/transactions", { key: otherLive }); ok("...switching approval back on blocks them again (403)", r.status === 403, r.json);

  console.log("# disabling LIVE access");
  r = await call("POST", `/admin/clients/${cid}/live-access`, { token: A, body: { enabled: false } }); ok("admin disables", r.status === 200);
  r = await call("GET", "/api/v1/moncash/transactions", { key: live }); ok("existing LIVE key blocked immediately (403)", r.status === 403, r.json);
  r = await call("GET", "/api/v1/moncash/transactions", { key: test.json.api_key }); ok("TEST keys unaffected", r.status === 200);
  await call("POST", `/admin/clients/${cid}/live-access`, { token: A, body: { enabled: true } });

  console.log("# fees + quote (no plan override)");
  const fees = { percentageBps: 150, fixedFee: { HTG: 5, USD: 0.1 }, providerFeeBps: 0, minAmount: { HTG: 10, USD: 1 }, maxAmount: { HTG: 1000000, USD: 10000 } };
  r = await call("PUT", "/admin/settings/fees", { token: A, body: fees }); ok("admin sets fees", r.status === 200);
  const qk = (await mkKey("TEST", ["payments:read"])).json.api_key;
  r = await call("GET", "/api/v1/quote?amount=1000&currency=HTG&provider=moncash", { key: qk }); ok("quote: 1.5% + 5 = 20", r.json.fee === 20 && r.json.total === 1020, r.json);
  await call("PUT", "/admin/settings/fees", { token: A, body: { ...fees, percentageBps: 100, fixedFee: { HTG: 0, USD: 0 } } });

  console.log("# providers + suspension + audit");
  r = await call("POST", "/admin/providers/check", { token: A }); ok("provider check works, no secrets", r.status === 200 && r.json.providers.some(p => p.code === "primary"));
  r = await call("POST", `/admin/clients/${cid}/suspend`, { token: A }); ok("suspend", r.status === 200);
  r = await call("GET", "/portal/overview", { token: CT }); ok("the suspended client's existing session is refused too (403)", r.status === 403, r.status);
  r = await call("GET", "/api/v1/moncash/transactions", { key: qk }); ok("suspended => keys blocked (403)", r.status === 403 && /suspended/.test(r.json.error.message));
  r = await call("POST", "/auth/login", { body: { email: `customer${stamp}@example.com`, password: PW } }); ok("suspended => can't log in", r.status === 403);
  await call("POST", `/admin/clients/${cid}/reactivate`, { token: A });
  r = await call("GET", "/admin/audit-logs", { token: A });
  ok("audit log records the admin actions", ["admin.client_suspended", "admin.client_reactivated", "admin.fees_updated", "admin.limits_updated", "admin.live_access_enabled", "admin.live_access_disabled"].every(a => r.json.logs.some(l => l.action === a)), r.json.logs.map(l => l.action));
  ok("audit log holds no secrets", !/hp_(live|test)_/.test(JSON.stringify(r.json)) && !/password/i.test(JSON.stringify(r.json)));
  r = await call("GET", "/internal/cron/webhook-delivery"); ok("cron rejects unauthenticated calls", r.status === 401);
  r = await fetch(API + "/internal/cron/webhook-delivery", { headers: { Authorization: "Bearer cronsecret" } }); ok("cron runs with the secret", r.status === 200);

  await db.end(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
