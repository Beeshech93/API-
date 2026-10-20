import { webhookRetryDelayMs } from "../src/utils/webhookRetry";

describe("webhook retry backoff", () => {
  it("uses the one-minute delay after the first failed attempt", () => {
    expect(webhookRetryDelayMs(1)).toBe(60_000);
  });

  it("follows the configured backoff schedule", () => {
    expect([1, 2, 3, 4, 5, 6].map(webhookRetryDelayMs)).toEqual([
      60_000,
      5 * 60_000,
      30 * 60_000,
      2 * 60 * 60_000,
      12 * 60 * 60_000,
      12 * 60 * 60_000,
    ]);
  });

  it("uses the first delay for zero or negative attempts defensively", () => {
    expect(webhookRetryDelayMs(0)).toBe(60_000);
    expect(webhookRetryDelayMs(-1)).toBe(60_000);
  });
});
