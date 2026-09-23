process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test?schema=public";
process.env.JWT_SECRET ??= "test-secret";
process.env.VERCEL ??= "1"; // tests run in production mode (no dev-only localhost exceptions)
process.env.CREDENTIALS_ENCRYPTION_KEY ??= require("crypto").randomBytes(32).toString("base64");
