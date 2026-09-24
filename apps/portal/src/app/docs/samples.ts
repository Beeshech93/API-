export const SANDBOX_NUMBERS: [string, string][] = [
  ["50900000001", "n1"],
  ["50900000002", "n2"],
  ["50900000003", "n3"],
  ["50900000004", "n4"],
  ["50937123456", "n5"],
];

type Sample = Partial<Record<"curl" | "javascript" | "node" | "php" | "python", string>>;

// Code samples shown in the docs, for the languages required by the spec.
export function samples(base: string) {
  const KEY = "hp_test_xxxxxxxx";
  const body = `{ "amount": 1000, "currency": "HTG", "phone": "50900000001", "reference": "ORDER-12345", "description": "Payment" }`;

  const payment = (network: string): Sample => ({
    curl: `curl -X POST ${base}/api/v1/${network}/payments \\\n  -H "Authorization: Bearer ${KEY}" \\\n  -H "Idempotency-Key: order-12345" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'`,
    javascript: `const res = await fetch("${base}/api/v1/${network}/payments", {\n  method: "POST",\n  headers: {\n    Authorization: "Bearer ${KEY}",\n    "Idempotency-Key": "order-12345",\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify({ amount: 1000, currency: "HTG", phone: "50900000001", reference: "ORDER-12345" }),\n});\nconst tx = await res.json();`,
    node: `// Node.js 18+ (server side only — never expose your key in a browser)\nconst res = await fetch("${base}/api/v1/${network}/payments", {\n  method: "POST",\n  headers: {\n    Authorization: \`Bearer \${process.env.HAITIPAY_API_KEY}\`,\n    "Idempotency-Key": "order-12345",\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify({ amount: 1000, currency: "HTG", phone: "50900000001", reference: "ORDER-12345" }),\n});\nconsole.log(await res.json());`,
    php: `<?php\n$ch = curl_init("${base}/api/v1/${network}/payments");\ncurl_setopt_array($ch, [\n  CURLOPT_POST => true,\n  CURLOPT_RETURNTRANSFER => true,\n  CURLOPT_HTTPHEADER => [\n    "Authorization: Bearer " . getenv("HAITIPAY_API_KEY"),\n    "Idempotency-Key: order-12345",\n    "Content-Type: application/json",\n  ],\n  CURLOPT_POSTFIELDS => json_encode([\n    "amount" => 1000, "currency" => "HTG",\n    "phone" => "50900000001", "reference" => "ORDER-12345",\n  ]),\n]);\n$tx = json_decode(curl_exec($ch), true);`,
    python: `import os, requests\n\nres = requests.post(\n    "${base}/api/v1/${network}/payments",\n    headers={\n        "Authorization": f"Bearer {os.environ['HAITIPAY_API_KEY']}",\n        "Idempotency-Key": "order-12345",\n    },\n    json={"amount": 1000, "currency": "HTG", "phone": "50900000001", "reference": "ORDER-12345"},\n)\ntx = res.json()`,
  });

  const transfer = (network: string): Sample => ({
    curl: `curl -X POST ${base}/api/v1/${network}/transfers \\\n  -H "Authorization: Bearer ${KEY}" \\\n  -H "Idempotency-Key: payout-789" \\\n  -H "Content-Type: application/json" \\\n  -d '{ "amount": 500, "currency": "HTG", "phone": "50937123456", "recipient": { "first_name": "Melissa", "last_name": "Francois" }, "reference": "PAYOUT-789" }'`,
    javascript: `const res = await fetch("${base}/api/v1/${network}/transfers", {\n  method: "POST",\n  headers: {\n    Authorization: "Bearer ${KEY}",\n    "Idempotency-Key": "payout-789",\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify({ amount: 500, currency: "HTG", phone: "50937123456", recipient: { first_name: "Melissa", last_name: "Francois" }, reference: "PAYOUT-789" }),\n});\nconst transfer = await res.json();`,
    node: `const res = await fetch("${base}/api/v1/${network}/transfers", {\n  method: "POST",\n  headers: {\n    Authorization: \`Bearer \${process.env.HAITIPAY_API_KEY}\`,\n    "Idempotency-Key": "payout-789",\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify({ amount: 500, currency: "HTG", phone: "50937123456", recipient: { first_name: "Melissa", last_name: "Francois" }, reference: "PAYOUT-789" }),\n});\nconsole.log(await res.json());`,
    php: `<?php\n$ch = curl_init("${base}/api/v1/${network}/transfers");\ncurl_setopt_array($ch, [\n  CURLOPT_POST => true,\n  CURLOPT_RETURNTRANSFER => true,\n  CURLOPT_HTTPHEADER => [\n    "Authorization: Bearer " . getenv("HAITIPAY_API_KEY"),\n    "Idempotency-Key: payout-789",\n    "Content-Type: application/json",\n  ],\n  CURLOPT_POSTFIELDS => json_encode([\n    "amount" => 500, "currency" => "HTG",\n    "phone" => "50937123456", "recipient" => ["first_name" => "Melissa", "last_name" => "Francois"],\n    "reference" => "PAYOUT-789",\n  ]),\n]);\n$transfer = json_decode(curl_exec($ch), true);`,
    python: `import os, requests\n\nres = requests.post(\n    "${base}/api/v1/${network}/transfers",\n    headers={\n        "Authorization": f"Bearer {os.environ['HAITIPAY_API_KEY']}",\n        "Idempotency-Key": "payout-789",\n    },\n    json={"amount": 500, "currency": "HTG", "phone": "50937123456", "recipient": {"first_name": "Melissa", "last_name": "Francois"}, "reference": "PAYOUT-789"},\n)\ntransfer = res.json()`,
  });

  const get = (path: string): Sample => ({
    curl: `curl ${base}${path} \\\n  -H "Authorization: Bearer ${KEY}"`,
    javascript: `const res = await fetch("${base}${path}", {\n  headers: { Authorization: "Bearer ${KEY}" },\n});\nconst data = await res.json();`,
    node: `const res = await fetch("${base}${path}", {\n  headers: { Authorization: \`Bearer \${process.env.HAITIPAY_API_KEY}\` },\n});\nconsole.log(await res.json());`,
    php: `<?php\n$ch = curl_init("${base}${path}");\ncurl_setopt_array($ch, [\n  CURLOPT_RETURNTRANSFER => true,\n  CURLOPT_HTTPHEADER => ["Authorization: Bearer " . getenv("HAITIPAY_API_KEY")],\n]);\n$data = json_decode(curl_exec($ch), true);`,
    python: `import os, requests\n\nres = requests.get(\n    "${base}${path}",\n    headers={"Authorization": f"Bearer {os.environ['HAITIPAY_API_KEY']}"},\n)\ndata = res.json()`,
  });

  return {
    auth: get("/api/v1/health"),
    moncash: payment("moncash"),
    natcash: payment("natcash"),
    payment: payment("moncash"),
    transfer: transfer("moncash"),
    transaction: get("/api/v1/moncash/transactions/txn_xxxxx"),
    balance: get("/api/v1/moncash/balance"),
    quote: get("/api/v1/quote?amount=1000&currency=HTG&provider=moncash"),
    simulate: {
      curl: `curl -X POST ${base}/api/v1/sandbox/transactions/txn_xxxxx/simulate \\\n  -H "Authorization: Bearer ${KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d '{ "outcome": "completed" }'`,
      node: `await fetch("${base}/api/v1/sandbox/transactions/txn_xxxxx/simulate", {\n  method: "POST",\n  headers: { Authorization: \`Bearer \${process.env.HAITIPAY_API_KEY}\`, "Content-Type": "application/json" },\n  body: JSON.stringify({ outcome: "completed" }),\n});`,
    } as Sample,
    verify: {
      node: `const crypto = require("crypto");\n\n// rawBody: the exact request body string; header: X-HaitiPay-Signature\nfunction isValid(secret, rawBody, header) {\n  const [t, v1] = header.split(",").map((p) => p.split("=")[1]);\n  const expected = crypto.createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");\n  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));\n}`,
      php: `<?php\nfunction is_valid($secret, $rawBody, $header) {\n  [$t, $v1] = array_map(fn($p) => explode("=", $p)[1], explode(",", $header));\n  $expected = hash_hmac("sha256", $t . "." . $rawBody, $secret);\n  return hash_equals($expected, $v1);\n}`,
      python: `import hmac, hashlib\n\ndef is_valid(secret: str, raw_body: str, header: str) -> bool:\n    t, v1 = [p.split("=")[1] for p in header.split(",")]\n    expected = hmac.new(secret.encode(), f"{t}.{raw_body}".encode(), hashlib.sha256).hexdigest()\n    return hmac.compare_digest(expected, v1)`,
    } as Sample,
    transferResponse: `{\n  "success": true,\n  "transaction_id": "txn_p4w9k2m7c1z5x8v3b6n0",\n  "type": "transfer",\n  "status": "pending",\n  "provider": "moncash",\n  "amount": 500,\n  "fee": 5,\n  "total": 505,\n  "currency": "HTG",\n  "phone": "50937123456",\n  "reference": "PAYOUT-789"\n}`,
    paymentResponse: `{\n  "success": true,\n  "transaction_id": "txn_x8k2m9q4w1z7c5v3b6n0",\n  "status": "pending",\n  "provider": "moncash",\n  "amount": 1000,\n  "fee": 10,\n  "total": 1010,\n  "currency": "HTG",\n  "phone": "50900000001",\n  "reference": "ORDER-12345",\n  "payment_url": null,\n  "environment": "test",\n  "request_id": "req_a1b2c3d4e5f6g7h8"\n}`,
    balanceResponse: `{ "success": true, "provider": "moncash", "environment": "live",
  "balances": [ {
    "currency": "HTG",
    "collected": 50000, "fees": 500, "net": 49500,
    "funded": 10000,
    "sent": 20000, "transfer_fees": 200,
    "available": 39300
  } ] }`,
    webhookPayload: `POST https://client.com/webhooks/haitipay\nX-HaitiPay-Signature: t=1758470400,v1=5257a869…\nX-HaitiPay-Event: payment.completed\n\n{\n  "event": "payment.completed",\n  "transaction_id": "txn_123",\n  "amount": 1000,\n  "currency": "HTG",\n  "provider": "moncash",\n  "status": "completed"\n}`,
  };
}
