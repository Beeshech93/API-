const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000] as const;

/**
 * Return the retry delay after a failure.
 * attempts is the total number of failed attempts after the current failure is recorded.
 * The schedule caps at the final delay for any subsequent attempts.
 */
export function webhookRetryDelayMs(attempts: number): number {
  const index = Math.min(Math.max(Math.floor(attempts) - 1, 0), BACKOFF_MS.length - 1);
  return BACKOFF_MS[index];
}
