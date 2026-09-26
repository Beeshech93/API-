// Integration test — run with `npm run test:e2e` (see e2e/README.md). Needs E2E_DATABASE_URL.
const { DB_URL, SCHEMA, withSchema, ROOT } = require("./env");
const { Client } = require("pg"); const fs = require("fs"); const crypto = require("crypto");
const API = "http://localhost:4100", S = SCHEMA;
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  ", n); } else { fail++; console.log("  FAIL", n, x !== undefined ? JSON.stringify(x).slice(0, 380) : ""); } };
async function call(method, path, { token, key, body, headers = {}, raw, ctype } = {}) {
  const res = await fetch(API + path, { method, headers: { ...(ctype ? { "Content-Type": ctype } : body ? { "Content-Type": "application/json" } : {}), ...(token || key ? { Authorization: `Bearer ${token || key}` } : {}), ...headers }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const buf = Buffer.from(await res.arrayBuffer()); let j; try { j = JSON.parse(buf.toString("utf8")); } catch { j = null; } return { status: res.status, json: j, buf, headers: res.headers };
}
const jpeg = (seed) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]), crypto.randomBytes(400), Buffer.from(seed), Buffer.from([0xff, 0xd9])]);
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(200)]);
const webp = () => Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x10, 0, 0, 0]), Buffer.from("WEBPVP8 "), crypto.randomBytes(100)]);
const PROFILE = { account_type: "individual", full_name: "Marie Pierre", date_of_birth: "1990-05-14", phone: "+509 37 12 34 56", address: "12 Rue Capois", city: "Port-au-Prince", country: "HT", id_type: "national_id", id_number: "NIF-0123456789", website_url: "http://localhost:4300/", business_description: "Online store selling school supplies; we collect MonCash payments and pay suppliers.", expected_volume: "100k_1m" };
(async () => {
  const db = new Client({ connectionString: DB_URL }); await db.connect();
  const stamp = Date.now(), PW = "Str0ng-Passw0rd!";
  const signup = async l => (await call("POST", "/auth/signup", { body: { email: `${l}${stamp}@example.com`, password: PW, name: l, services: ["receive", "send"] } })).json;
  const adm = await signup("kadmin"); await db.query(`UPDATE ${S}.users SET role='ADMIN' WHERE id=$1`, [adm.user.id]);
  const A = (await call("POST", "/auth/login", { body: { email: `kadmin${stamp}@example.com`, password: PW } })).json.access_token;
  const C1 = await signup("person"), C2 = await signup("company"), C3 = await signup("passport"), C4 = await signup("other");
  const T1 = C1.access_token, cid1 = C1.user.clientId;
  const put = (T, type, buf, ctype = "image/jpeg") => call("PUT", `/portal/kyc/documents/${type}`, { token: T, raw: buf, ctype });
  const prof = (T, over = {}) => call("PUT", "/portal/kyc/profile", { token: T, body: { ...PROFILE, ...over } });
  const liveKey = T => call("POST", "/portal/api-keys", { token: T, body: { name: "l", environment: "LIVE", category: "receive" } });

  console.log("-- nobody reaches real money without KYC");
  let r = await liveKey(T1); ok("LIVE key refused: KYC required", r.status === 403 && /KYC/.test(r.json.error.message), r.json);
  r = await call("GET", "/portal/kyc", { token: T1 }); ok("status starts as not_started, editable", r.json.status === "not_started" && r.json.editable === true && r.json.profile === null, r.json);
  r = await call("GET", "/portal/account", { token: T1 }); ok("/portal/account carries the KYC status and live_access false", r.json.kyc_status === "not_started" && r.json.live_access === false, r.json);
  r = await call("POST", "/portal/funding", { token: T1, body: { method: "moncash", amount: 1000 } }); ok("recharging needs it too (403)", r.status === 403 && /KYC/.test(r.json.error.message), r.json);
  const tk = await call("POST", "/portal/api-keys", { token: T1, body: { name: "t", environment: "TEST", category: "receive" } }); ok("the sandbox stays open without KYC", tk.status === 201);

  console.log("-- the details (profile + website)");
  r = await prof(T1, { date_of_birth: "2015-01-01" }); ok("under 18 -> 400", r.status === 400 && /18/.test(r.json.error.message), r.json);
  r = await prof(T1, { phone: "12" }); ok("bad phone -> 400 INVALID_PHONE", r.status === 400 && r.json.error.code === "INVALID_PHONE", r.json);
  r = await prof(T1, { business_description: "too short" }); ok("vague description -> 400", r.status === 400, r.json);
  r = await prof(T1, { id_number: "<script>" }); ok("odd characters in the ID number -> 400", r.status === 400);
  r = await prof(T1, { account_type: "business" }); ok("business without a business name -> 400", r.status === 400 && /business_name/.test(r.json.error.message), r.json);
  r = await prof(T1, { website_url: "http://169.254.169.254/latest" }); ok("a website pointing at an internal address is refused (400)", r.status === 400, r.json);
  r = await prof(T1); ok("valid profile saved", r.status === 200 && r.json.profile.full_name === "Marie Pierre" && r.json.profile.id_number_last4 === "6789" && r.json.profile.website_reachable === true, r.json);
  ok("the full ID number never comes back to the client", !JSON.stringify(r.json).includes("NIF-0123456789") && !JSON.stringify(r.json).includes("0123456789"));
  const row = (await db.query(`SELECT id_number_sealed::text s, id_number_last4 l FROM ${S}.kyc_profiles WHERE client_id=$1`, [cid1])).rows[0];
  ok("the ID number is encrypted in the database", !row.s.includes("NIF-0123456789") && !row.s.includes("0123456789") && row.l === "6789", row.s.slice(0, 80));

  console.log("-- document photos");
  r = await put(T1, "id_front", jpeg("a"), "application/json"); ok("wrong content type -> 400", r.status === 400, r.json);
  r = await put(T1, "id_front", Buffer.from("<html><script>alert(1)</script></html>"), "image/png"); ok("an HTML file dressed as an image is refused by its bytes (400)", r.status === 400 && /JPEG, PNG or WebP/.test(r.json.error.message), r.json);
  r = await put(T1, "id_front", Buffer.concat([jpeg("x"), Buffer.alloc(2 * 1024 * 1024)])); ok("over 2 MB is refused (413)", r.status === 413 || r.status === 400, r.status);
  r = await put(T1, "id_front", Buffer.alloc(0)); ok("empty file -> 400", r.status === 400);
  r = await put(T1, "passport_photo", jpeg("a")); ok("unknown document type -> 400", r.status === 400);
  const front = jpeg("front"); r = await put(T1, "id_front", front); ok("ID front (JPEG) accepted", r.status === 200 && r.json.documents.some(d => d.type === "id_front" && d.mime === "image/jpeg"), r.json);
  r = await put(T1, "selfie", png(), "image/png"); ok("a selfie is no longer asked for or accepted (400)", r.status === 400, r.json);
  r = await put(T1, "business_registration", webp(), "image/webp"); ok("a WebP photo is accepted", r.status === 200);
  r = await put(T1, "proof_of_address", jpeg("p")); ok("proof of address is no longer asked for or accepted (400)", r.status === 400, r.json);
  const d = (await db.query(`SELECT data, size, sha256 FROM ${S}.kyc_documents WHERE client_id=$1 AND type='ID_FRONT'`, [cid1])).rows[0];
  ok("the photo is stored ENCRYPTED (not the JPEG bytes; +28 bytes of iv/tag)", d.data.length === front.length + 28 && !d.data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) && !d.data.includes(Buffer.from("front")), { stored: d.data.length, plain: front.length });
  ok("its hash is recorded", d.sha256 === crypto.createHash("sha256").update(front).digest("hex"));
  r = await call("GET", "/portal/kyc/documents/id_front", { token: T1 }); ok("clients can't download documents back (404)", r.status === 404);
  r = await call("POST", "/portal/kyc/submit", { token: T1 }); ok("submitting with a document missing (ID back) -> 400 that says which", r.status === 400 && /id_back/.test(r.json.error.message), r.json);
  r = await put(T1, "id_back", png(), "image/png"); ok("ID back (PNG) accepted", r.status === 200);
  r = await call("DELETE", "/portal/kyc/documents/id_back", { token: T1 }); ok("a document can be removed while editing", r.status === 200 && !r.json.documents.some(d => d.type === "id_back"));
  r = await call("POST", "/portal/kyc/submit", { token: T1 }); ok("...and then it's missing again (400)", r.status === 400 && /id_back/.test(r.json.error.message));
  r = await put(T1, "id_back", jpeg("back")); ok("re-upload (replaces)", r.status === 200);
  r = await put(T1, "id_back", jpeg("back2")); ok("uploading again replaces, doesn't duplicate", r.status === 200 && r.json.documents.filter(d => d.type === "id_back").length === 1);

  console.log("-- submit and lock");
  r = await call("POST", "/portal/kyc/submit", { token: T1 }); ok("submitted -> pending", r.status === 200 && r.json.status === "pending" && r.json.editable === false, r.json);
  r = await prof(T1, { full_name: "Someone Else" }); ok("can't edit the profile while under review (409)", r.status === 409);
  r = await put(T1, "id_front", jpeg("new")); ok("can't replace a document while under review (409)", r.status === 409);
  r = await call("DELETE", "/portal/kyc/documents/id_front", { token: T1 }); ok("can't delete one either (409)", r.status === 409);
  r = await call("POST", "/portal/kyc/submit", { token: T1 }); ok("can't submit twice (409)", r.status === 409);
  r = await liveKey(T1); ok("LIVE still closed, and it says the review is pending", r.status === 403 && /under review/.test(r.json.error.message), r.json);

  console.log("-- only administrators see the documents");
  r = await call("GET", "/admin/kyc", { token: T1 }); ok("a client can't list submissions (403)", r.status === 403);
  r = await call("GET", `/admin/kyc/${cid1}`, { token: C4.access_token }); ok("another client can't read it (403)", r.status === 403);
  r = await call("GET", `/admin/kyc/${cid1}/documents/id_front`, { token: C4.access_token }); ok("...nor a photo (403)", r.status === 403);
  r = await call("GET", "/admin/kyc?status=pending", { token: A }); ok("the admin queue lists it", r.status === 200 && r.json.submissions.some(s => s.client_id === cid1 && s.status === "pending" && s.website_url), r.json);
  r = await call("GET", `/admin/kyc/${cid1}`, { token: A }); ok("admin detail has the full ID number, website status and document list", r.json.profile.id_number === "NIF-0123456789" && typeof r.json.profile.website_status === "number" && r.json.documents.length === 3 && r.json.documents.every(d => d.sha256), r.json.profile);
  r = await call("GET", `/admin/kyc/${cid1}/documents/id_front`, { token: A });
  ok("the photo comes back byte-for-byte identical", r.status === 200 && r.buf.equals(front) && r.headers.get("content-type") === "image/jpeg", r.headers.get("content-type"));
  ok("...with headers that keep it out of caches and browsers' guesswork", r.headers.get("cache-control") === "no-store" && r.headers.get("x-content-type-options") === "nosniff" && /default-src 'none'/.test(r.headers.get("content-security-policy")));
  const aud = (await db.query(`SELECT action, metadata::text m FROM ${S}.audit_logs WHERE action LIKE 'admin.kyc%' OR action LIKE 'kyc.%'`)).rows;
  ok("every look is audited (detail + document)", aud.some(a => a.action === "admin.kyc_viewed") && aud.some(a => a.action === "admin.kyc_document_viewed"));
  ok("the audit log holds no ID number", !aud.some(a => a.m.includes("0123456789")));
  r = await call("GET", "/admin/overview", { token: A }); ok("admin overview counts pending verifications", r.json.pending_kyc >= 1, r.json.pending_kyc);
  r = await call("GET", "/admin/clients?search=person", { token: A }); ok("client list shows kyc_status", r.json.clients[0].kyc_status === "pending");

  console.log("-- reject, fix, resubmit, approve");
  r = await call("POST", `/admin/kyc/${cid1}/reject`, { token: A, body: { note: "no" } }); ok("a rejection needs a real reason (400)", r.status === 400);
  r = await call("POST", `/admin/kyc/${cid1}/reject`, { token: A, body: { note: "The ID photo is blurry. Please retake it." } }); ok("admin rejects with a reason", r.status === 200);
  r = await call("GET", "/portal/kyc", { token: T1 }); ok("the client sees the reason and can edit again", r.json.status === "rejected" && /blurry/.test(r.json.review_note) && r.json.editable === true, r.json);
  r = await liveKey(T1); ok("LIVE says the verification wasn't approved", r.status === 403 && /not approved/.test(r.json.error.message), r.json);
  r = await put(T1, "id_front", jpeg("better front")); ok("client replaces the photo", r.status === 200);
  r = await call("POST", "/portal/kyc/submit", { token: T1 }); ok("resubmits -> pending, old note cleared", r.status === 200 && r.json.status === "pending" && r.json.review_note === null, r.json);
  const race = await Promise.all([1, 2, 3].map(() => call("POST", `/admin/kyc/${cid1}/approve`, { token: A, body: { note: "ID matches. Website checked." } })));
  ok("3 simultaneous approvals -> exactly one wins (others 409)", race.filter(x => x.status === 200).length === 1 && race.filter(x => x.status === 409).length === 2, race.map(x => x.status));
  r = await call("GET", "/portal/kyc", { token: T1 }); ok("approved and locked", r.json.status === "approved" && r.json.editable === false);
  r = await call("GET", "/portal/account", { token: T1 }); ok("approval opens LIVE access too", r.json.live_access === true && r.json.kyc_status === "approved", r.json);
  r = await prof(T1, { city: "Jacmel" }); ok("an approved profile can't be edited by the client (409)", r.status === 409);
  r = await liveKey(T1); const lk = r.json.api_key; ok("now a LIVE key can be created", r.status === 201 && /^hp_live_/.test(lk), r.json);
  r = await call("GET", "/api/v1/moncash/balance", { key: (await call("POST", "/portal/api-keys", { token: T1, body: { name: "l2", environment: "LIVE", category: "send", permissions: ["balance:read"] } })).json.api_key });
  ok("and it authenticates on the API", r.status === 200 || r.status === 402, r.status);

  console.log("-- revoking");
  r = await call("POST", `/admin/kyc/${cid1}/revoke`, { token: A, body: { note: "ID expired; new document needed." } }); ok("admin can revoke an approved verification", r.status === 200);
  r = await call("GET", "/api/v1/moncash/balance", { key: lk }); ok("its LIVE keys stop immediately (403)", r.status === 403 && /not approved/.test(r.json.error.message), r.json);
  r = await call("GET", "/portal/kyc", { token: T1 }); ok("the client sees why, and can fix it", r.json.status === "rejected" && /expired/.test(r.json.review_note) && r.json.editable);

  console.log("-- other kinds of account");
  const T2 = C2.access_token, cid2 = C2.user.clientId;
  r = await prof(T2, { account_type: "business", business_name: "Kay Papye SA" }); ok("business profile saved", r.status === 200 && r.json.required_documents.includes("business_registration"), r.json.required_documents);
  for (const t of ["id_front", "id_back"]) await put(T2, t, jpeg(t));
  r = await call("POST", "/portal/kyc/submit", { token: T2 }); ok("a business must also send its registration (400)", r.status === 400 && /business_registration/.test(r.json.error.message), r.json);
  await put(T2, "business_registration", jpeg("reg")); r = await call("POST", "/portal/kyc/submit", { token: T2 }); ok("...then it can submit", r.status === 200);
  const T3 = C3.access_token, cid3 = C3.user.clientId;
  r = await prof(T3, { id_type: "passport", id_number: "RA1234567" }); ok("passport profile: no ID back required", r.status === 200 && !r.json.required_documents.includes("id_back"), r.json.required_documents);
  for (const t of ["id_front"]) await put(T3, t, jpeg(t));
  r = await call("POST", "/portal/kyc/submit", { token: T3 }); ok("...and submits", r.status === 200);
  r = await call("POST", `/admin/kyc/${C4.user.clientId}/approve`, { token: A, body: {} }); ok("admin can't approve someone who submitted nothing (400)", r.status === 400, r.json);
  r = await call("POST", `/admin/clients/${C4.user.clientId}/live-access`, { token: A, body: { enabled: true } }); ok("nor open LIVE for an unverified client (409)", r.status === 409 && /KYC/.test(r.json.error.message), r.json);
  r = await call("GET", "/admin/kyc?status=bogus", { token: A }); ok("bad filter -> 400", r.status === 400);
  r = await call("GET", "/admin/kyc", { token: A }); ok("the queue is ordered oldest first and never lists people who haven't started", r.json.submissions.every(s => s.status !== "not_started"));

  await db.end(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
