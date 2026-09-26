// Local stand-in for the payment provider, following its public API docs.
const http = require("http"); const crypto = require("crypto");
const USERS = { prov_test_user: "sk_test_secret", prov_send_user: "sk_send_secret" };
const state = { tokens: new Map(), orders: {}, transfers: {}, log: [], wallet: 500000 };
const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
http.createServer((req, res) => {
  let b = ""; req.on("data", d => b += d); req.on("end", () => {
    const body = b ? JSON.parse(b) : {}; const url = new URL(req.url, "http://x"); const p = url.pathname;
    const auth = (req.headers.authorization || "").replace("Bearer ", "");
    if (!p.startsWith("/__")) state.log.push({ method: req.method, path: p, body, auth: !!auth, user: state.tokens.get(auth) || null });
    if (p === "/__state") return send(res, 200, state);
    if (p === "/__revoke") { state.tokens.clear(); return send(res, 200, {}); }
    if (p === "/__set") { const t = state.orders[body.id] || state.transfers[body.id]; t.status = body.status; if (body.amount) t.amount = body.amount; return send(res, 200, t); }
    if (p === "/__reset") { state.log.length = 0; return send(res, 200, {}); }
    if (p === "/token") {
      if (!USERS[body.userID] || USERS[body.userID] !== body.secretKey) return send(res, 401, { success: false, error: { code: "invalid_credentials", message: "Invalid userID or secretKey" } });
      const t = "tok_" + crypto.randomBytes(6).toString("hex"); state.tokens.set(t, body.userID);
      return send(res, 200, { success: true, token: t, user_id: body.userID, expires_at: Date.now() + 86400000, message: "Authentication successful" });
    }
    if (!state.tokens.has(auth)) return send(res, 401, { error: "Unauthorized", message: "Invalid token" });
    if (req.method === "POST" && p === "/moncash/token") {
      if (!body.gdes || !body.userID) return send(res, 400, { error: "Missing required parameters", message: "Amount and userID are required" });
      const id = "ORD_sandbox_" + crypto.randomBytes(4).toString("hex");
      state.orders[id] = { orderId: id, status: "pending", amount: body.gdes, referenceId: body.referenceId };
      return send(res, 200, { orderId: id, gourdes: body.gdes, status: "pending", redirectUrl: "https://moncashbutton.example/redirect?token=" + crypto.randomBytes(8).toString("hex"), transactionType: "moncash_deposit_via_api" });
    }
    let m;
    if (req.method === "GET" && (m = p.match(/^\/order\/(.+)$/))) {
      const o = state.orders[m[1]]; if (!o) return send(res, 404, { error: "Not Found" });
      return send(res, 200, { referenceId: o.referenceId, orderId: o.orderId, status: o.status, amount: o.amount, currency: "HTG" });
    }
    if (req.method === "POST" && (m = p.match(/^\/(moncash|natcash)\/transfers$/))) {
      if (!body.gdes || !body.wallet || !body.customerFirstName || !body.customerLastName) return send(res, 400, { error: "Missing required parameters" });
      if (body.wallet === "00000402") return send(res, 402, { error: "Insufficient Funds", message: "Not enough balance" });
      if (body.wallet === "00000500") return send(res, 500, { error: "Internal server error" });
      const id = "TRF_" + Date.now() + "_" + crypto.randomBytes(4).toString("hex");
      state.transfers[id] = { transaction_id: id, status: body.wallet === "00000001" ? "completed" : "pending", amount: body.gdes, provider: m[1], wallet: body.wallet, referenceId: body.referenceId };
      state.wallet -= body.gdes;
      return send(res, 201, { ...state.transfers[id], fees: 5, total: body.gdes + 5, currency: "HTG", message: "Transfer created successfully" });
    }
    if (req.method === "GET" && (m = p.match(/^\/transfers\/(.+)$/))) {
      const t = state.transfers[m[1]]; if (!t) return send(res, 404, { error: "Not Found" }); return send(res, 200, t);
    }
    if (req.method === "GET" && p === "/balance") return send(res, 200, { available: state.wallet, reserved: 0, currency: "HTG", environment: "sandbox" });
    send(res, 404, { error: "Not Found" });
  });
}).listen(4300, () => console.log("mock provider on :4300"));
