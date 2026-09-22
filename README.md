# AyitiPay

A unified developer API for Haiti's mobile money providers — **MonCash** (Digicel) and
**NatCash** (Natcom) — plus a self-serve developer portal, interactive docs, webhooks,
and a per-transaction billing ledger.

Each developer application connects **its own** MonCash/NatCash merchant credentials
(marketplace model, not a shared platform merchant account). Credentials are encrypted
at rest with AES-256-GCM.

## Status

v1 scaffold. Real MonCash/NatCash "live" API contracts are **not yet implemented** —
no official documentation was available to confirm the real endpoints, auth flow, or
webhook payload/signature scheme. TEST-mode keys work fully today against a built-in
mock/sandbox. See the TODO comments in `apps/api/src/providers/*/*.adapter.ts` before
attempting to go live.

## Getting started

```bash
cp .env.example apps/api/.env
cp .env.example apps/portal/.env.local   # only NEXT_PUBLIC_* vars are read here
```

Generate a `CREDENTIALS_ENCRYPTION_KEY` and put it in `apps/api/.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Start Postgres:

```bash
docker compose up -d
```

Install dependencies and run the first migration:

```bash
npm install
npm run prisma:migrate --workspace apps/api -- --name init
```

Run both apps:

```bash
npm run dev:api      # http://localhost:4000
npm run dev:portal   # http://localhost:3000
```

Run the API test suite:

```bash
npm test
```

## Project layout

```
apps/api/      Express API — public /v1/* payments API, /portal/* dashboard API,
                /auth/* developer auth, /webhooks/* inbound provider callbacks,
                and the webhook delivery worker.
apps/portal/   Next.js developer portal — marketing site, dashboard, and docs (MDX)
                with an interactive "try it" console.
packages/shared/  Enums and DTOs shared by both apps.
```

See `.claude/plans/` in this session's history (or ask for a copy) for the full
design write-up, including the domain model, provider-adapter interface, and the
list of open items to confirm before enabling live payments.
