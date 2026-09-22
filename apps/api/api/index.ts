import { createApp } from "../src/app";

// Vercel serverless entrypoint: exporting the Express app directly (no
// .listen()) lets Vercel's Node runtime handle each request as its own
// invocation. `vercel.json`'s rewrite sends every path here.
export default createApp();
