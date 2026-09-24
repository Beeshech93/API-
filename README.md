# HaitiPay API

One API for **MonCash** and **NatCash**. Clients get an API key (`hp_live_…` / `hp_test_…`);
every request goes through our backend, which validates the key, permissions,
LIVE access and rate limits before anything reaches the payment provider. Provider
credentials belong to the platform operator only and never reach a client or a browser.

```
CLIENT → API KEY → HAITIPAY API → validation → LIVE access / rate limits → PaymentService → provider → MonCash / NatCash
```

## What's here

- `apps/api` — Express + Prisma (Postgres): public `/api/v1`, dashboard `/portal/*`, admin `/admin/*`, auth `/auth/*`.
- `apps/portal` — Next.js: landing, client dashboard, admin panel and docs (FR default, EN, HT, ES).
- `packages/shared` — shared types.

## Status

- **Works end to end:** signup/login (rotating httpOnly refresh tokens), API keys with permissions, idempotent payments **and transfers (send money)** on both MonCash and NatCash — payouts draw only on the client's collected balance, reserved atomically — quotes/fees, HMAC webhooks
  (SSRF-protected), each account chooses at sign-up whether it receives payments, sends money or both, per-client LIVE access approval, separate provider credentials for receiving and for sending, balance recharge (MonCash automatic; NatCash, Zelle, bank, USDT verified by an administrator), rate limits per client / key / endpoint / IP, API + audit logs,
  admin panel, and a deterministic **sandbox** that never moves money.
- **LIVE processing** is wired to the payment provider from its public API docs
  (`apps/api/src/providers/live.provider.ts`): every LIVE request is validated, priced and
  recorded by the backend, then sent to the provider with the credentials an administrator saved in
  the admin panel. Receiving payments works on MonCash (hosted payment page, HTG, ≤ 75,000);
  sending money works on MonCash and NatCash. The provider does not offer NatCash pay-in, so
  that stays unavailable. Outcomes are never taken on trust: a signed provider notification
  (`POST /webhooks/provider`) only triggers a re-read of the transaction from the provider, LIVE
  transactions are also re-checked when a client reads them and by the daily job, and a payment is
  never completed for a different amount than requested.
  **Not yet exercised against the real provider** — it has been tested against a local stand-in that
  follows the documented contract, so run it with the provider's *sandbox* credentials first.
- **Also pending:** email verification / password reset / 2FA, and an online payment processor
  (billing is provider-agnostic; today an admin confirms payment).

## Running locally

```bash
cp .env.example apps/api/.env      # then fill it in
npm install
npm run prisma:migrate --workspace @ayitipay/api
npx tsx apps/api/prisma/seed.ts    # providers, fee and limit settings
npm run dev:api                    # :4000
npm run dev:portal                 # :3000
npm test
```

Promote the first administrator (never possible through the public API):

```bash
npm run admin:promote --workspace @ayitipay/api -- you@example.com
```
