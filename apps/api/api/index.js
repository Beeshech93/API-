// Committed shim so Vercel detects the function before the build runs; the real
// app is bundled into dist/vercel.js by `npm run build:vercel` (see vercel-build).
module.exports = require("../dist/vercel.js");
