// Integration test — run with `npm run test:e2e` (see e2e/README.md). Needs E2E_DATABASE_URL.
const { DB_URL, SCHEMA, withSchema, ROOT } = require("./env");
const http = require("http");
const { Client: PgClient } = require("pg");

const crypto = require("crypto");
const API = "http://localhost:4100";
const ORIGIN = "http://localhost:3000";
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log("  ok  ", name); } else { fail++; console.log("  FAIL", name, extra !== undefined ? JSON.stringify(extra) : ""); } };

async function call(method, path, { token, key, body, headers = {}, cookie } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  const setCookie = res.headers.get("set-cookie");
  return { status: res.status, json, headers: res.headers, refreshCookie: setCookie ? setCookie.split(";")[0] : null };
}

(async () => {
  const db = new PgClient({ connectionString: DB_URL }); await db.connect();
  // webhook receiver
  const received = [];
  const receiver = http.createServer((req, res) => { let b = ""; req.on("data", d => b += d); req.on("end", () => { received.push({ headers: req.headers, body: b }); res.end("ok"); }); }).listen(4200);

  console.log("# public");
  let r = await call("GET", "/api/v1/health");
  ok("health payload", r.status === 200 && r.json.status === "ok" && r.json.service === "HaitiPay API" && r.json.version === "1.0.0", r.json);
  r = await call("GET", "/api/v1/plans");
  ok("no plans endpoint any more (404)", r.status === 404, r.status)
  r = await call("GET", "/api/v1/nothing");
  ok("unknown route => standardized 404 with request_id", r.status === 404 && r.json.success === false && r.json.error.request_id.startsWith("req_"), r.json);

  console.log("# auth");
  const email = `e2e${Date.now()}@example.com`;
  r = await call("POST", "/auth/signup", { body: { services: ["receive", "send"], email, password: "short", name: "E2E" } });
  ok("weak password rejected", r.status === 400, r.json);
  r = await call("POST", "/auth/signup", { body: { services: ["receive", "send"], email, password: "Str0ng-Passw0rd!", name: "E2E Client" } });
  ok("signup 201 + access token + httpOnly cookie", r.status === 201 && !!r.json.access_token && /hp_refresh=/.test(r.refreshCookie || "") && !JSON.stringify(r.json).includes("refresh_token"), r.json);
  const setCookieRaw = r.headers.get("set-cookie");
  ok("refresh cookie is HttpOnly", /HttpOnly/i.test(setCookieRaw));
  let access = r.json.access_token, cookie1 = r.refreshCookie;
  r = await call("POST", "/auth/signup", { body: { services: ["receive", "send"], email, password: "Str0ng-Passw0rd!", name: "dup" } });
  ok("duplicate email => 409 CONFLICT", r.status === 409 && r.json.error.code === "CONFLICT", r.json);
  r = await call("POST", "/auth/login", { body: { email, password: "wrong-password-1" } });
  ok("wrong password => 401 UNAUTHORIZED (no user enumeration)", r.status === 401 && r.json.error.code === "UNAUTHORIZED");
  r = await call("POST", "/auth/refresh", { cookie: cookie1 });
  ok("refresh without trusted Origin => 403 (CSRF guard)", r.status === 403, r.json);
  r = await call("POST", "/auth/refresh", { cookie: cookie1, headers: { Origin: ORIGIN } });
  ok("refresh rotates the token", r.status === 200 && !!r.json.access_token && r.refreshCookie && r.refreshCookie !== cookie1, r.json);
  const cookie2 = r.refreshCookie; access = r.json.access_token;
  r = await call("POST", "/auth/refresh", { cookie: cookie1, headers: { Origin: ORIGIN } });
  ok("re-using an old refresh token is rejected", r.status === 401, r.json);
  r = await call("POST", "/auth/refresh", { cookie: cookie2, headers: { Origin: ORIGIN } });
  ok("...and revokes the whole token family", r.status === 401, r.json);
  r = await call("POST", "/auth/login", { body: { email, password: "Str0ng-Passw0rd!" } });
  access = r.json.access_token;
  ok("login ok", r.status === 200 && !!access);
  r = await call("GET", "/portal/overview");
  ok("dashboard requires auth", r.status === 401);
  r = await call("GET", "/admin/overview", { token: access });
  ok("admin area forbidden for normal users", r.status === 403, r.json);

  console.log("# api keys");
  r = await call("POST", "/portal/api-keys", { token: access, body: { name: "live-early", environment: "LIVE", permissions: ["payments:create"] } });
  ok("LIVE key before an admin enables LIVE access => 403", r.status === 403 && r.json.error.code === "FORBIDDEN" && /KYC|LIVE access/.test(r.json.error.message), r.json);
  r = await call("POST", "/portal/api-keys", { token: access, body: { name: "sandbox", environment: "TEST", permissions: ["payments:create", "payments:read", "transactions:read", "balance:read", "webhooks:manage"] } });
  const testKey = r.json.api_key;
  ok("TEST key hp_test_ shown once in full", r.status === 201 && /^hp_test_/.test(testKey), r.json);
  r = await call("GET", "/portal/api-keys", { token: access });
  ok("listing shows only the masked key", r.json.api_keys.length === 1 && /^hp_test_•{12}.{4}$/.test(r.json.api_keys[0].masked_key) && !JSON.stringify(r.json).includes(testKey), r.json.api_keys[0]);
  r = await call("POST", "/portal/api-keys", { token: access, body: { name: "ro", environment: "TEST", permissions: ["transactions:read"] } });
  const roKey = r.json.api_key;

  console.log("# payments (sandbox)");
  r = await call("GET", "/api/v1/moncash/transactions", { key: "hp_test_bogusbogusbogus" });
  ok("bad API key => 401 INVALID_API_KEY", r.status === 401 && r.json.error.code === "INVALID_API_KEY");
  const pay = (phone, extra = {}, hdr = {}) => call("POST", "/api/v1/moncash/payments", { key: testKey, headers: hdr, body: { amount: 1000, currency: "HTG", phone, reference: "ORDER-1", description: "Payment", ...extra } });
  r = await pay("50937123456");
  ok("missing Idempotency-Key => 400", r.status === 400 && r.json.error.code === "INVALID_REQUEST", r.json);
  r = await pay("12345", {}, { "Idempotency-Key": "k-bad-phone" });
  ok("INVALID_PHONE", r.status === 400 && r.json.error.code === "INVALID_PHONE", r.json);
  r = await pay("50937123456", { amount: -5 }, { "Idempotency-Key": "k-bad-amt" });
  ok("INVALID_AMOUNT (negative)", r.json.error?.code === "INVALID_AMOUNT", r.json);
  r = await pay("50937123456", { amount: 999999999 }, { "Idempotency-Key": "k-big-amt" });
  ok("INVALID_AMOUNT (above max)", r.json.error?.code === "INVALID_AMOUNT", r.json);
  r = await call("POST", "/api/v1/moncash/payments", { key: roKey, headers: { "Idempotency-Key": "k-ro" }, body: { amount: 1000, currency: "HTG", phone: "50937123456" } });
  ok("key without payments:create => 403 FORBIDDEN", r.status === 403 && r.json.error.code === "FORBIDDEN", r.json);

  r = await pay("50937123456", {}, { "Idempotency-Key": "order-12345" });
  const first = r.json;
  ok("create => 201 pending, provider moncash, txn_ id, fee/total", r.status === 201 && first.status === "pending" && first.provider === "moncash" && /^txn_/.test(first.transaction_id) && first.fee === 10 && first.total === 1010 && first.environment === "test", first);
  r = await pay("50937123456", {}, { "Idempotency-Key": "order-12345" });
  ok("idempotent replay => same transaction, 200, Idempotent-Replayed", r.status === 200 && r.json.transaction_id === first.transaction_id && r.headers.get("idempotent-replayed") === "true", r.json);
  r = await pay("50937123456", { amount: 2000 }, { "Idempotency-Key": "order-12345" });
  ok("same key, different params => 422", r.status === 422, r.json);
  r = await call("GET", "/api/v1/moncash/transactions", { key: testKey });
  ok("only ONE transaction was created for the repeated key", r.json.transactions.filter(t => t.reference === "ORDER-1").length === 1 && r.json.transactions.length === 1, r.json.transactions?.length);

  r = await pay("50900000001", {}, { "Idempotency-Key": "k-complete" });
  ok("test number ...0001 completes immediately", r.status === 201 && r.json.status === "completed", r.json);
  r = await pay("50900000002", {}, { "Idempotency-Key": "k-fail" });
  ok("test number ...0002 => failed w/ error code", r.json.status === "failed" && r.json.error?.code === "TRANSACTION_FAILED", r.json);
  r = await pay("50900000003", {}, { "Idempotency-Key": "k-nobal" });
  ok("...0003 => INSUFFICIENT_BALANCE", r.json.error?.code === "INSUFFICIENT_BALANCE", r.json);
  r = await pay("50900000004", {}, { "Idempotency-Key": "k-timeout" });
  ok("...0004 => PROVIDER_TIMEOUT 504", r.status === 504 && r.json.error.code === "PROVIDER_TIMEOUT", r.json);
  r = await call("GET", "/portal/transactions?limit=50", { token: access });
  const timedOut = r.json.transactions.find(t => t.error?.code === "PROVIDER_TIMEOUT");
  ok("timed-out payment stays PROCESSING (outcome unknown), not FAILED", timedOut?.status === "processing", timedOut);
  ok("every transaction has a unique request_id", new Set(r.json.transactions.map(t => t.request_id)).size === r.json.transactions.length);

  r = await call("GET", `/api/v1/natcash/transactions/${first.transaction_id}`, { key: testKey });
  ok("transaction is provider-scoped (moncash txn via natcash => 404)", r.status === 404 && r.json.error.code === "TRANSACTION_NOT_FOUND");
  r = await call("GET", `/api/v1/moncash/transactions/${first.transaction_id}`, { key: testKey });
  ok("GET transaction", r.status === 200 && r.json.transaction_id === first.transaction_id);
  r = await call("POST", "/api/v1/natcash/payments", { key: testKey, headers: { "Idempotency-Key": "nat-1" }, body: { amount: 500, currency: "HTG", phone: "50937123456" } });
  ok("NatCash payments work with the same API", r.status === 201 && r.json.provider === "natcash", r.json);
  r = await call("GET", "/api/v1/quote?amount=1000&currency=HTG&provider=moncash", { key: testKey });
  ok("quote matches spec: fee 10 / total 1010", r.status === 200 && r.json.fee === 10 && r.json.total === 1010 && r.json.currency === "HTG", r.json);
  r = await call("GET", "/api/v1/moncash/balance", { key: testKey });
  ok("balance = client's collected funds (not the provider wallet)", r.status === 200 && r.json.balances[0].currency === "HTG" && r.json.balances[0].collected === 1000, r.json);

  console.log("# sandbox simulate + webhooks");
  r = await call("POST", "/portal/webhooks", { token: access, body: { url: "http://169.254.169.254/latest" } });
  ok("webhook to cloud-metadata IP blocked (SSRF)", r.status === 400, r.json);
  r = await call("POST", "/portal/webhooks", { token: access, body: { url: "http://localhost:4200/hook", events: ["payment.completed", "payment.failed"] } });
  const whSecret = r.json.secret;
  ok("webhook registered; secret returned once", r.status === 201 && /^whsec_/.test(whSecret), r.json);
  r = await call("GET", "/portal/webhooks", { token: access });
  ok("webhook secret never listed again", !JSON.stringify(r.json).includes(whSecret));
  received.length = 0;
  r = await call("POST", `/api/v1/sandbox/transactions/${first.transaction_id}/simulate`, { key: testKey, body: { outcome: "completed" } });
  ok("simulate pending => completed", r.status === 200 && r.json.status === "completed", r.json);
  // Webhooks are delivered in the background now, so give them a moment.
  let hook; for (let i = 0; i < 40 && !hook; i++) { hook = received.find(h => JSON.parse(h.body).event === "payment.completed"); if (!hook) await new Promise(s => setTimeout(s, 250)); }
  ok("webhook delivered for payment.completed", !!hook, received.map(h => h.body));
  if (hook) {
    const [t, v1] = hook.headers["x-haitipay-signature"].split(",").map(p => p.split("=")[1]);
    const expected = crypto.createHmac("sha256", whSecret).update(`${t}.${hook.body}`).digest("hex");
    ok("X-HaitiPay-Signature is a valid HMAC of the body", expected === v1);
    const payload = JSON.parse(hook.body);
    ok("payload has event/transaction_id/amount/currency/provider/status", payload.transaction_id === first.transaction_id && payload.amount === 1000 && payload.currency === "HTG" && payload.provider === "moncash" && payload.status === "completed", payload);
  }
  r = await call("POST", `/api/v1/sandbox/transactions/${first.transaction_id}/simulate`, { key: testKey, body: { outcome: "failed" } });
  ok("can't change a finished transaction", r.status === 409, r.json);
  r = await call("GET", "/api/v1/moncash/balance", { key: testKey });
  ok("balance now includes completed payments", r.json.balances[0].collected === 2000, r.json);
  r = await call("GET", "/portal/webhook-deliveries", { token: access });
  ok("delivery log shows succeeded", r.json.deliveries.some(d => d.status === "succeeded"));

  console.log("# multi-tenant isolation");
  const email2 = `e2eb${Date.now()}@example.com`;
  r = await call("POST", "/auth/signup", { body: { services: ["receive", "send"], email: email2, password: "Str0ng-Passw0rd!", name: "Other Client" } });
  const access2 = r.json.access_token;
  r = await call("POST", "/portal/api-keys", { token: access2, body: { name: "k", environment: "TEST", permissions: ["transactions:read"] } });
  const key2 = r.json.api_key;
  r = await call("GET", `/api/v1/moncash/transactions/${first.transaction_id}`, { key: key2 });
  ok("another client can't read my transaction (404)", r.status === 404);
  r = await call("GET", `/portal/transactions/${first.transaction_id}`, { token: access2 });
  ok("...nor via the dashboard", r.status === 404);
  r = await call("GET", "/api/v1/moncash/transactions", { key: key2 });
  ok("...and sees none of my transactions", r.json.transactions.length === 0);

  console.log("# LIVE access (no plans)");
  r = await call("GET", "/portal/overview", { token: access });
  ok("overview says LIVE is off and has no plan/limit fields", r.json.live_access === false && r.json.plan === undefined && r.json.requests.limit === undefined, r.json);
  r = await call("POST", "/portal/billing/plan", { token: access, body: { plan_code: "STARTER" } });
  ok("billing/plan endpoints are gone (404)", r.status === 404, r.status);
  await db.query(`UPDATE ${SCHEMA}.clients SET live_enabled = true, kyc_status = 'APPROVED' WHERE id = (SELECT client_id FROM ${SCHEMA}.users WHERE email = $1)`, [email]);
  r = await call("POST", "/portal/api-keys", { token: access, body: { name: "prod", environment: "LIVE", permissions: ["payments:create", "transactions:read"] } });
  const liveKey = r.json.api_key;
  ok("LIVE key hp_live_ now allowed", r.status === 201 && /^hp_live_/.test(liveKey), r.json);
  r = await call("POST", "/portal/api-keys", { token: access, body: { name: "prod2", environment: "LIVE", permissions: ["payments:create"] } });
  ok("a second LIVE key is allowed (no per-plan key cap)", r.status === 201, r.json);
  await call("DELETE", `/portal/api-keys/${(await call("GET", "/portal/api-keys", { token: access })).json.api_keys.find(k => k.name === "prod2").id}`, { token: access });
  r = await call("POST", "/api/v1/moncash/payments", { key: liveKey, headers: { "Idempotency-Key": "live-1" }, body: { amount: 1000, currency: "HTG", phone: "50937123456" } });
  ok("LIVE payment fails closed (provider not configured) with PROVIDER_ERROR, no fake success", r.status === 502 && r.json.error.code === "PROVIDER_ERROR", r.json);
  r = await call("GET", "/api/v1/moncash/transactions", { key: liveKey });
  ok("LIVE key can't see TEST transactions; the rejected LIVE attempt created nothing", r.json.transactions.length === 0, r.json.transactions);
  r = await call("GET", "/portal/overview", { token: access });
  ok("overview: LIVE on, usage counted for LIVE only, no quota", r.json.live_access === true && r.json.requests.used >= 2 && r.json.active_api_keys >= 3, r.json.requests);
  r = await call("POST", `/portal/api-keys/${(await call("GET", "/portal/api-keys", { token: access })).json.api_keys.find(k => k.environment === "LIVE" && k.status === "active").id}/rotate`, { token: access });
  const rotated = r.json.api_key;
  ok("rotate returns a new key", /^hp_live_/.test(rotated) && rotated !== liveKey, r.json);
  r = await call("GET", "/api/v1/moncash/transactions", { key: liveKey });
  ok("old key stops working after rotate", r.status === 401);
  r = await call("GET", "/api/v1/moncash/transactions", { key: rotated });
  ok("new key works", r.status === 200);
  await db.query(`UPDATE ${SCHEMA}.clients SET live_enabled = false WHERE id = (SELECT client_id FROM ${SCHEMA}.users WHERE email = $1)`, [email]);
  r = await call("GET", "/api/v1/moncash/transactions", { key: rotated });
  ok("disabling LIVE access stops LIVE keys immediately (403)", r.status === 403, r.json);
  await db.query(`UPDATE ${SCHEMA}.clients SET live_enabled = true, kyc_status = 'APPROVED' WHERE id = (SELECT client_id FROM ${SCHEMA}.users WHERE email = $1)`, [email]);

  console.log("# rate limiting");
  let limited = null;
  for (let i = 0; i < 130 && !limited; i++) { const x = await call("GET", "/api/v1/moncash/transactions", { key: testKey }); if (x.status === 429) limited = x; }
  ok("HTTP 429 RATE_LIMIT_EXCEEDED with retry_after + Retry-After", !!limited && limited.json.error.code === "RATE_LIMIT_EXCEEDED" && limited.json.error.retry_after > 0 && !!limited.headers.get("retry-after"), limited?.json);

  console.log("# logs");
  r = await call("GET", "/portal/api-logs?limit=100", { token: access });
  ok("API logs recorded with request_id/endpoint/method/status/time/ip", r.json.logs.length > 5 && r.json.logs.every(l => l.request_id && l.endpoint && l.method && l.status_code && l.response_time_ms >= 0), r.json.logs?.[0]);
  ok("logs never contain keys/secrets", !JSON.stringify(r.json).includes(testKey) && !JSON.stringify(r.json).includes("Bearer"));
  r = await call("GET", "/portal/api-logs?status=429", { token: access });
  ok("log filter by status works", r.json.logs.length >= 1 && r.json.logs.every(l => l.status_code === 429));

  receiver.close();
  await db.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
