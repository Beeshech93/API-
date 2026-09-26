# Integration tests

About 550 checks that drive the real API over HTTP against a real Postgres, with a stand-in for the
payment provider (`mock-provider.js`) that follows the provider's documented contract. They cover
sandbox and LIVE payments and transfers, recharges, KYC, API-key categories, the receive/send APIs,
webhooks (signatures, exactly-once delivery), rate limits, sessions, and the security rules.

```bash
# any scratch Postgres database, WITHOUT a ?schema= part; every suite gets (and drops) its own schema
E2E_DATABASE_URL=postgresql://user:pass@localhost:5432/haitipay_test npm run test:e2e
E2E_DATABASE_URL=... npm run test:e2e -- kyc live      # only some suites
```

The suites never call a real payment provider or move real money. Use a throwaway database.
