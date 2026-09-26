// Integration test — run with `npm run test:e2e` (see e2e/README.md). Needs E2E_DATABASE_URL.
const { DB_URL, SCHEMA, withSchema, ROOT } = require("./env");
const http = require("http"); const crypto = require("crypto");
const API = "http://localhost:4100";
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  ", n); } else { fail++; console.log("  FAIL", n, x !== undefined ? JSON.stringify(x) : ""); } };
async function call(method, path, { token, key, body, headers = {} } = {}) {
  const res = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token || key ? { Authorization: `Bearer ${token || key}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: res.status, json: j, headers: res.headers, raw: t };
}
(async () => {
  const received = []; const rx = http.createServer((q, s) => { let b = ""; q.on("data", d => b += d); q.on("end", () => { received.push(JSON.parse(b)); s.end("ok"); }); }).listen(4200);
  const stamp = Date.now();
  const su = (await call("POST", "/auth/signup", { body: { services: ["receive", "send"], email: `tr${stamp}@example.com`, password: "Str0ng-Passw0rd!", name: "Transfer Client" } })).json;
  const T = su.access_token;
  const mkKey = async (perms) => (await call("POST", "/portal/api-keys", { token: T, body: { name: "k" + Math.random(), environment: "TEST", permissions: perms } })).json.api_key;
  // Receiving and sending are separate APIs with separate keys.
  const payKey = await mkKey(["payments:create", "payments:read", "transactions:read", "balance:read"]);
  const key = await mkKey(["transfers:create", "transfers:read", "transactions:read", "balance:read"]);
  const payOnly = await mkKey(["payments:create", "transactions:read", "balance:read"]);
  await call("POST", "/portal/webhooks", { token: T, body: { url: "http://localhost:4200/hook", events: ["transfer.pending", "transfer.completed", "transfer.failed"] } });
  const pay = (net, phone, k, amount = 1000, kk = payKey) => call("POST", `/api/v1/${net}/payments`, { key: kk, headers: { "Idempotency-Key": k }, body: { amount, currency: "HTG", phone } });
  const xfer = (net, phone, k, amount = 500, kk = key) => call("POST", `/api/v1/${net}/transfers`, { key: kk, headers: { "Idempotency-Key": k }, body: { amount, currency: "HTG", phone, reference: "PAYOUT" } });
  const bal = async (net = "moncash") => (await call("GET", `/api/v1/${net}/balance`, { key })).json.balances.find(b => b.currency === "HTG");

  console.log("# both networks can send money");
  let r = await xfer("moncash", "50937123456", "t-empty");
  ok("transfer with no balance => 402 INSUFFICIENT_BALANCE (nothing is sent)", r.status === 402 && r.json.error.code === "INSUFFICIENT_BALANCE" && /available/.test(r.json.error.message), r.json);
  r = await call("GET", "/api/v1/moncash/transactions", { key });
  ok("...and no transaction row was created for the rejected transfer", r.json.transactions.length === 0);

  r = await pay("moncash", "50900000001", "fund-mc"); ok("fund MonCash: payment completes", r.json.status === "completed" && r.json.type === "payment", r.json);
  r = await pay("natcash", "50900000001", "fund-nc"); ok("fund NatCash: payment completes", r.json.status === "completed");
  let b = await bal("moncash"); ok("pooled balance across both networks: collected 2000, fees 20, available 1980", b.collected === 2000 && b.fees === 20 && b.available === 1980 && b.sent === 0, b);

  r = await xfer("moncash", "50937123456", "t1", 500);
  const t1 = r.json;
  ok("MonCash transfer created: type=transfer, fee 5, total 505, pending", r.status === 201 && t1.type === "transfer" && t1.status === "pending" && t1.fee === 5 && t1.total === 505, t1);
  b = await bal("moncash"); ok("funds reserved immediately: available 1475, sent 500", b.available === 1475 && b.sent === 500 && b.transfer_fees === 5, b);
  r = await xfer("moncash", "50937123456", "t2", 1500);
  ok("can't spend the same money twice (1475 < 1515)", r.status === 402 && r.json.error.code === "INSUFFICIENT_BALANCE", r.json);
  r = await xfer("natcash", "50937123456", "n1", 300);
  ok("NatCash transfer works (drawing on the pooled balance)", r.status === 201 && r.json.provider === "natcash" && r.json.type === "transfer", r.json);
  b = await bal("natcash"); ok("pooled balance after the NatCash payout: 1475 - 303 = 1172", b.available === 1172, b);
  b = await bal("moncash"); ok("...and both networks report the same pool", (await bal("moncash")).available === 1172);

  console.log("# idempotency + safety");
  r = await xfer("moncash", "50937123456", "t1", 500);
  ok("same Idempotency-Key => same transfer (200), not a second payout", r.status === 200 && r.json.transaction_id === t1.transaction_id && r.headers.get("idempotent-replayed") === "true");
  b = await bal("moncash"); ok("...and the balance wasn't debited twice", b.available === 1172, b);
  r = await xfer("moncash", "50937123456", "t1", 999);
  ok("same key, different amount => 422", r.status === 422);
  r = await call("POST", "/api/v1/moncash/transfers", { key, body: { amount: 10, currency: "HTG", phone: "50937123456" } });
  ok("transfers require an Idempotency-Key", r.status === 400);
  r = await xfer("moncash", "12345", "t-badphone", 50);
  ok("INVALID_PHONE on transfers too", r.json.error?.code === "INVALID_PHONE");
  r = await xfer("moncash", "50937123456", "t-noperm", 50, payOnly);
  ok("a payments-only key can NOT send money (403)", r.status === 403 && /receive-payments API, not the send-money API/.test(r.json.error.message), r.json);
  r = await call("GET", "/api/v1/moncash/transfers", { key: payOnly });
  ok("...nor list transfers without transfers:read", r.status === 403);

  console.log("# race: parallel transfers must never overspend");
  // fresh balance: 1000 net 990 more on MonCash -> fund again to a known number
  await pay("moncash", "50900000001", "fund-mc2", 5000); // +5000 -50 fee
  b = await bal("moncash"); const before = b.available; // 485 + 4950 = 5435
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => xfer("moncash", "50937123456", `race-${i}`, 1000)));
  const okCount = results.filter(x => x.status === 201).length, rej = results.filter(x => x.status === 402).length;
  const maxAffordable = Math.floor(before / 1010);
  b = await bal("moncash");
  ok(`8 parallel transfers of 1000 (+10 fee) vs balance ${before}: exactly ${maxAffordable} accepted`, okCount === maxAffordable && rej === 8 - maxAffordable, { okCount, rej, maxAffordable });
  ok("balance never goes negative", b.available >= 0, b);

  console.log("# outcomes + webhooks");
  await pay("natcash", "50900000001", "fund-after-race", 3000); // the race test drained the shared pool
  before2 = (await bal("natcash")).available;
  r = await xfer("natcash", "50900000001", "n-ok", 100);
  ok("test number ...0001: transfer completes immediately", r.json.status === "completed", r.json);
  r = await xfer("natcash", "50900000002", "n-fail", 100);
  ok("test number ...0002: transfer fails", r.json.status === "failed" && r.json.error.code === "TRANSACTION_FAILED", r.json);
  b = await bal("natcash"); ok("failed transfer released its funds (only the completed one is debited: 687 - 101)", b.available === before2 - 101, { before2, b });
  r = await xfer("natcash", "50900000004", "n-timeout", 100);
  ok("provider timeout => 504", r.status === 504 && r.json.error.code === "PROVIDER_TIMEOUT", r.json);
  b = await bal("natcash"); ok("timed-out transfer stays reserved (outcome unknown): 687 - 101 - 101", b.available === before2 - 202, b);
  r = await call("GET", "/api/v1/natcash/transfers", { key });
  ok("timed-out transfer is PROCESSING for reconciliation", r.json.transfers.some(t => t.status === "processing" && t.error?.code === "PROVIDER_TIMEOUT"));
  r = await call("POST", `/api/v1/sandbox/transactions/${t1.transaction_id}/simulate`, { key, body: { outcome: "completed" } });
  ok("simulate completes the pending transfer", r.status === 200 && r.json.status === "completed" && r.json.type === "transfer", r.json);
  await new Promise(s => setTimeout(s, 600));
  const evs = received.map(e => e.event);
  ok("webhooks: transfer.pending, transfer.completed and transfer.failed delivered", ["transfer.pending", "transfer.completed", "transfer.failed"].every(e => evs.includes(e)), evs);
  ok("webhook payload for transfers has type/amount/currency/provider/status", received.some(e => e.event === "transfer.completed" && e.type === "transfer" && e.currency === "HTG" && e.provider && e.status === "completed"));
  ok("no payment.* events were sent to this transfer-only webhook", !evs.some(e => e.startsWith("payment.")), evs);

  console.log("# reading transfers");
  r = await call("GET", `/api/v1/moncash/transfers/${t1.transaction_id}`, { key });
  ok("GET /transfers/:id", r.status === 200 && r.json.type === "transfer");
  const paymentId = (await call("GET", "/api/v1/moncash/transactions?type=payment", { key })).json.transactions[0].transaction_id;
  r = await call("GET", `/api/v1/moncash/transfers/${paymentId}`, { key });
  ok("a PAYMENT id is not a transfer (404)", r.status === 404);
  r = await call("GET", "/api/v1/moncash/transfers", { key });
  ok("GET /transfers lists only transfers", r.json.transfers.length > 0 && r.json.transfers.every(t => t.type === "transfer"));
  r = await call("GET", "/api/v1/moncash/transactions?type=payment", { key });
  ok("GET /transactions?type=payment lists only payments", r.json.transactions.every(t => t.type === "payment"));

  console.log("# LIVE fails closed");
  r = await call("POST", "/portal/api-keys", { token: T, body: { name: "live", environment: "LIVE", permissions: ["transfers:create"] } });
  ok("LIVE key refused until an admin enables LIVE access (403)", r.status === 403 && r.json.error.code === "FORBIDDEN", r.json);
  ok("no provider name in the error", !/acme pay/i.test(JSON.stringify(r.json)));

  rx.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
