const path = require("path");

// Shared settings for the integration tests. Each suite runs in its own Postgres schema so it
// never touches real data: E2E_DATABASE_URL is a Postgres URL WITHOUT a `schema` parameter.
const DB_URL = process.env.E2E_DATABASE_URL;
if (!DB_URL) {
  console.error("Set E2E_DATABASE_URL to a Postgres URL (a scratch database), e.g. postgresql://user:pass@localhost:5432/haitipay_test");
  process.exit(2);
}

const withSchema = (url, schema) => `${url}${url.includes("?") ? "&" : "?"}schema=${schema}`;

module.exports = {
  DB_URL,
  SCHEMA: process.env.E2E_SCHEMA || "hp_e2e",
  withSchema,
  ROOT: path.resolve(__dirname, ".."),
};
