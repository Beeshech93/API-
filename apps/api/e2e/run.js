#!/usr/bin/env node
// Runs the integration suites. For each one it creates a fresh Postgres schema, applies the
// migrations and seed, starts a stand-in for the payment provider (mock-provider.js, which follows
// the provider's documented contract) and the API, runs the suite, then removes the schema.
//
//   E2E_DATABASE_URL=postgresql://user:pass@localhost:5432/scratch node e2e/run.js [suite ...]
//
// Suites: main transfers live funding roles split-apis key-categories kyc admin provider-config review
const { spawn, spawnSync } = require("child_process");
const path = require("path");
const crypto = require("crypto");
const { Client } = require("pg");

const ROOT = path.resolve(__dirname, "..");
const BASE = process.env.E2E_DATABASE_URL;
if (!BASE) {
  console.error("Set E2E_DATABASE_URL to a scratch Postgres database (no ?schema= part).");
  process.exit(2);
}
const ALL = ["main", "transfers", "live", "funding", "roles", "split-apis", "key-categories", "kyc", "admin", "provider-config", "review"];
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
const withSchema = (schema) => `${BASE}${BASE.includes("?") ? "&" : "?"}schema=${schema}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, args, env) => spawnSync(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, encoding: "utf8", shell: process.platform === "win32" });

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {}
    await sleep(500);
  }
  return false;
}

async function assertPortsFree() {
  for (const port of [4100, 4300]) {
    try {
      await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(1000) });
      console.error(`Port ${port} is already in use (a previous run left a server behind?). Stop it and try again.`);
      process.exit(2);
    } catch {}
  }
}

async function runSuite(name) {
  const schema = `hp_e2e_${name.replace(/[^a-z0-9]/g, "_")}`;
  const url = withSchema(schema);
  const db = new Client({ connectionString: BASE });
  await db.connect();
  await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.end();

  const migrate = run("npx", ["prisma", "migrate", "deploy"], { DATABASE_URL: url });
  const seed = run("npx", ["tsx", "prisma/seed.ts"], { DATABASE_URL: url });
  if (migrate.status !== 0 || seed.status !== 0) {
    console.error(migrate.stdout, migrate.stderr, seed.stdout, seed.stderr);
    return false;
  }

  // Each child leads its own process group so that stopping it stops everything it started
  // (`npx tsx` runs the server as a grandchild; killing only npx would leave the server running).
  const provider = spawn("node", ["e2e/mock-provider.js"], { cwd: ROOT, stdio: "ignore", detached: true });
  const api = spawn("npx", ["tsx", "src/server.ts"], {
    cwd: ROOT,
    detached: true,
    stdio: process.env.E2E_DEBUG ? "inherit" : "ignore",
    env: {
      ...process.env,
      DATABASE_URL: url,
      PORT: "4100",
      JWT_SECRET: "e2e-jwt-secret-that-is-long-enough-0123456789",
      PORTAL_APP_URL: "http://localhost:3000",
      CRON_SECRET: "cronsecret",
      CREDENTIALS_ENCRYPTION_KEY: crypto.randomBytes(32).toString("base64"),
      API_PUBLIC_URL: "https://api.example.test",
    },
  });
  let ok = false;
  try {
    if (!(await waitFor("http://localhost:4100/health"))) throw new Error("the API did not start");
    console.log(`\n===== ${name} =====`);
    const result = spawnSync("node", [path.join(__dirname, `${name}.test.js`)], {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, E2E_DATABASE_URL: BASE, E2E_SCHEMA: schema },
    });
    ok = result.status === 0;
  } finally {
    for (const child of [api, provider]) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {}
    }
    await sleep(800);
    const cleanup = new Client({ connectionString: BASE });
    await cleanup.connect();
    await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await cleanup.end();
  }
  return ok;
}

(async () => {
  await assertPortsFree();
  const results = [];
  for (const name of wanted) {
    if (!ALL.includes(name)) {
      console.error(`Unknown suite "${name}". Suites: ${ALL.join(", ")}`);
      process.exit(2);
    }
    results.push([name, await runSuite(name).catch((e) => (console.error(e), false))]);
  }
  console.log("\n" + results.map(([n, ok]) => `${ok ? "PASS" : "FAIL"}  ${n}`).join("\n"));
  process.exit(results.every(([, ok]) => ok) ? 0 : 1);
})();
