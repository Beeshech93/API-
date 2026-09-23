// Bundled by esbuild into api/index.js (see the `build:vercel` script) — plain
// CJS so Vercel receives the Express app as module.exports, and so the "@/"
// path aliases are resolved at bundle time instead of by Vercel's compiler.
module.exports = require("./app").createApp();
