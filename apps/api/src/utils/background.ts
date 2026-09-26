import { waitUntil } from "@vercel/functions";

// Runs work after the response has been sent. On Vercel the function stays alive until it finishes;
// elsewhere it is a plain fire-and-forget. Errors are swallowed: this is never the caller's problem.
export function inBackground(work: Promise<unknown>): void {
  const safe = work.catch(() => undefined);
  try {
    waitUntil(safe);
  } catch {
    void safe;
  }
}
