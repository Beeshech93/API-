# HaitiPay API

One API for **MonCash** and **NatCash**. Clients get an API key (`hp_live_…` / `hp_test_…`);
every request goes through our backend, which validates the key, permissions, plan,
limits and quota before anything reaches the payment provider. Provider
credentials belong to the platform operator only and never reach a client or a browser.

```
CLIENT → API KEY → HAITIPAY API → validation → plan / limits / quota → PaymentService → provider → MonCash / NatCash
```

## What's here

- `apps/api` — Express + Prisma (Postgres): public `/api/v1`, dashboard `/portal/*`, admin `/admin/*`, auth `/auth/*`.
- `apps/portal` — Next.js: landing, client dashboard, admin panel and docs (FR default, EN, HT, ES).
- `packages/shared` — shared types.

## Status

- **Works end to end:** signup/login (rotating httpOnly refresh tokens), plans & subscriptions (trial →
  admin-confirmed activation), API keys with permissions, idempotent payments, quotes/fees, HMAC webhooks
  (SSRF-protected), rate limits per client / key / endpoint / IP, atomic monthly quota, API + audit logs,
  admin panel, and a deterministic **sandbox** that never moves money.
- **Not implemented yet:** LIVE processing. The provider's API contract hasn't been confirmed, so the live
  provider fails closed (`PROVIDER_ERROR`) instead of inventing endpoints — see `apps/api/src/providers/live.provider.ts`.
  Also pending: transfers, email verification / password reset / 2FA, and an online payment processor
  (billing is provider-agnostic; today an admin confirms payment).

## Running locally

```bash
cp .env.example apps/api/.env      # then fill it in
npm install
npm run prisma:migrate --workspace @ayitipay/api
npx tsx apps/api/prisma/seed.ts    # plans, providers, fee settings
npm run dev:api                    # :4000
npm run dev:portal                 # :3000
npm test
```

Promote the first administrator (never possible through the public API):

```bash
npm run admin:promote --workspace @ayitipay/api -- you@example.com
```
