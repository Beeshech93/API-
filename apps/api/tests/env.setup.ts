process.env.DATABASE_URL ??= "postgresql://ayitipay:ayitipay@localhost:5432/ayitipay_test?schema=public";
process.env.JWT_SECRET ??= "test-secret";
process.env.CREDENTIALS_ENCRYPTION_KEY ??= require("crypto").randomBytes(32).toString("base64");
