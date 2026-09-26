// Integration test — run with `npm run test:e2e` (see e2e/README.md). Needs E2E_DATABASE_URL.
const { DB_URL, SCHEMA, withSchema, ROOT } = require("./env");
const { Client } = require("pg"); const fs = require("fs"); const http = require("http"); const { spawn } = require("child_process");
const API = "http://localhost:4100", API2 = "http://localhost:4101", S = SCHEMA, ORIGIN = "http://localhost:3000";
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  ", n); } else { fail++; console.log("  FAIL", n, x !== undefined ? JSON.stringify(x).slice(0, 300) : ""); } };
async function call(method, path, { base = API, token, key, body, headers = {} } = {}) {
  const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(token || key ? { Authorization: `Bearer ${token || key}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = null; } return { status: res.status, json: j, headers: res.headers };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const url = DB_URL;
  const db = new Client({ connectionString: url }); await db.connect();
  const stamp = Date.now(), PW = "Str0ng-Passw0rd!";
  const signup = async l => (await call("POST", "/auth/signup", { body: { email: `${l}${stamp}@example.com`, password: PW, name: l, services: ["receive", "send"] } })).json;

  console.log("-- sign-in protections");
  const victim = await signup("victim"), other = await signup("bystander");
  let r; const codes = [];
  for (let i = 0; i < 12; i++) codes.push((await call("POST", "/auth/login", { body: { email: `victim${stamp}@example.com`, password: "wrong-password-" + i } })).status);
  ok("after 10 wrong passwords the account stops accepting attempts (429)", codes.slice(0, 10).every(c => c === 401) && codes.slice(10).every(c => c === 429), codes);
  r = await call("POST", "/auth/login", { body: { email: `victim${stamp}@example.com`, password: PW } }); ok("...even the right password waits out the window (429 + Retry-After)", r.status === 429 && !!r.headers.get("retry-after"), r.status);
  r = await call("POST", "/auth/login", { body: { email: `bystander${stamp}@example.com`, password: PW } }); ok("other accounts are not affected", r.status === 200);
  r = await call("POST", "/auth/login", { body: { email: `nobody${stamp}@example.com`, password: "x".repeat(12) } }); ok("unknown email answers like a wrong password (401)", r.status === 401);
  // refresh must not be throttled by sign-in traffic
  const su = await fetch(API + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `bystander${stamp}@example.com`, password: PW }) });
  let cookie = su.headers.get("set-cookie").split(";")[0]; const rc = [];
  for (let i = 0; i < 45; i++) { const rf = await fetch(API + "/auth/refresh", { method: "POST", headers: { Cookie: cookie, Origin: ORIGIN } }); rc.push(rf.status); const nc = rf.headers.get("set-cookie"); if (nc) cookie = nc.split(";")[0]; }
  ok("45 silent refreshes in a minute all succeed (a page load per user, many users behind one IP)", rc.every(c => c === 200), rc.filter(c => c !== 200));
  const spoof = []; for (let i = 0; i < 25; i++) spoof.push((await call("POST", "/auth/login", { body: { email: `nobody${stamp}@example.com`, password: "x".repeat(12) }, headers: { "X-Forwarded-For": `203.0.113.${i}` } })).status);
  ok("a made-up X-Forwarded-For doesn't dodge the per-IP limit (20/min on sign-in)", spoof.includes(429), spoof.filter(c => c === 429).length);

  console.log("-- suspended accounts lose access at once");
  const adm = await signup("radmin"); await db.query(`UPDATE ${S}.users SET role='ADMIN' WHERE id=$1`, [adm.user.id]);
  const A = (await call("POST", "/auth/login", { body: { email: `radmin${stamp}@example.com`, password: PW } })).json.access_token;
  const tok = other.access_token; r = await call("GET", "/portal/overview", { token: tok }); ok("a live session works", r.status === 200);
  await call("POST", `/admin/clients/${other.user.clientId}/suspend`, { token: A }); r = await call("GET", "/portal/overview", { token: tok }); ok("suspending the account blocks its existing access token immediately (403)", r.status === 403 && /suspended/.test(r.json.error.message), r.status);
  await call("POST", `/admin/clients/${other.user.clientId}/reactivate`, { token: A });
  const before = await call("GET", "/admin/overview", { token: A }); ok("an administrator's token works for admin", before.status === 200);
  await db.query(`UPDATE ${S}.users SET role='USER' WHERE id=$1`, [adm.user.id]); r = await call("GET", "/admin/overview", { token: A }); ok("taking admin rights away is immediate, not 15 minutes later (403)", r.status === 403, r.status);
  await db.query(`UPDATE ${S}.users SET role='ADMIN' WHERE id=$1`, [adm.user.id]);
  await db.query(`DELETE FROM ${S}.refresh_tokens WHERE user_id=$1`, [victim.user.id]); await db.query(`DELETE FROM ${S}.users WHERE id=$1`, [victim.user.id]).catch(() => {});
  r = await call("GET", "/portal/overview", { token: victim.access_token }); ok("a deleted user's token stops working (401)", r.status === 401, r.status);

  console.log("-- webhooks: delivered once, and never in the way");
  let received = 0, slowMs = 0; const hits = [];
  const rx = http.createServer((q, s) => { let b = ""; q.on("data", d => b += d); q.on("end", () => { received++; try { hits.push(JSON.parse(b)); } catch {} if (q.url === "/slow") return setTimeout(() => s.end("ok"), 4000); s.end("ok"); }); }).listen(4200);
  const T = (await call("POST", "/auth/login", { body: { email: `bystander${stamp}@example.com`, password: PW } })).json.access_token; const cid = other.user.clientId;
  r = await call("POST", "/portal/webhooks", { token: T, body: { url: "http://localhost:4200/hook", events: ["payment.completed"] } }); const wh = r.json.id;
  r = await call("POST", "/portal/webhooks", { token: T, body: { url: "http://169.254.169.254/latest", events: ["payment.completed"] } }); ok("a webhook aimed at the cloud metadata address is refused", r.status === 400, r.json);
  const txn = await call("POST", "/portal/api-keys", { token: T, body: { name: "k", environment: "TEST", category: "receive" } }); const key = txn.json.api_key;
  const p = await call("POST", "/api/v1/receive/moncash/payments", { key, headers: { "Idempotency-Key": "rv1" }, body: { amount: 1000, currency: "HTG", phone: "50900000001" } });
  const tid = p.json.transaction_id; await sleep(1500); received = 0; hits.length = 0;
  const N = 8; for (let i = 0; i < N; i++) await db.query(`INSERT INTO ${S}.webhook_deliveries (id, webhook_id, transaction_id, event, payload, status, attempts, next_attempt_at, created_at) VALUES (gen_random_uuid(), $1, $2, 'payment.completed', $3, 'PENDING', 0, now() - interval '1 minute', now())`, [wh, tid, JSON.stringify({ event: "payment.completed", n: i })]);
  const child = spawn("npx", ["tsx", "src/server.ts"], { cwd: ROOT, detached: true, env: { ...process.env, DATABASE_URL: withSchema(DB_URL, S), PORT: "4101", JWT_SECRET: "unit-test-jwt-secret-that-is-long-enough-0123456789", PORTAL_APP_URL: ORIGIN, CRON_SECRET: "cronsecret", CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") }, stdio: "ignore" });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(API2 + "/health")).ok) break; } catch {} await sleep(500); }
  const cron = (base) => fetch(base + "/internal/cron/webhook-delivery", { headers: { Authorization: "Bearer cronsecret" } }).then(r => r.status);
  const runs = await Promise.all([cron(API), cron(API2), cron(API), cron(API2), cron(API2)]); await sleep(1500);
  ok("two API instances sweeping at the same moment: every event delivered exactly once", runs.every(s => s === 200) && received === N && new Set(hits.map(h => h.n)).size === N, { received, distinct: new Set(hits.map(h => h.n)).size });
  const st = (await db.query(`SELECT status, count(*)::int n FROM ${S}.webhook_deliveries WHERE webhook_id=$1 GROUP BY 1`, [wh])).rows; ok("...and all recorded as delivered", st.length >= 1 && st.every(x => x.status === "SUCCEEDED"), st);
  // a slow endpoint must not slow the client's own API call
  await call("DELETE", `/portal/webhooks/${wh}`, { token: T });
  // baseline: how long a payment takes here (the database is remote) with no webhook at all
  const b0 = Date.now(); await call("POST", "/api/v1/receive/moncash/payments", { key, headers: { "Idempotency-Key": "rv-base" }, body: { amount: 1000, currency: "HTG", phone: "50900000001" } }); const base = Date.now() - b0;
  await call("POST", "/portal/webhooks", { token: T, body: { url: "http://localhost:4200/slow", events: ["payment.completed", "payment.pending"] } });
  const t0 = Date.now(); r = await call("POST", "/api/v1/receive/moncash/payments", { key, headers: { "Idempotency-Key": "rv2" }, body: { amount: 1000, currency: "HTG", phone: "50900000001" } }); const ms = Date.now() - t0;
  ok("a webhook endpoint that takes 4 s to answer doesn't delay the API response", r.status === 201 && ms < base + 2000, `${ms} ms with the slow endpoint vs ${base} ms without`);
  await sleep(6000);
  ok("...it is still delivered afterwards", hits.some(h => h.event === "payment.completed") && (await db.query(`SELECT count(*)::int n FROM ${S}.webhook_deliveries WHERE status='SUCCEEDED' AND webhook_id <> $1`, [wh])).rows[0].n >= 1);
  try { process.kill(-child.pid, "SIGTERM"); } catch {} rx.close();

  await db.end(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
