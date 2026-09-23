import { assertAmountInRange, computeQuote, DEFAULT_FEE_CONFIG } from "@/services/fee.service";

describe("quote", () => {
  it("matches the spec example: 1000 HTG at 1% => fee 10, total 1010", () => {
    expect(computeQuote(1000, "HTG", DEFAULT_FEE_CONFIG)).toEqual({ amount: 1000, fee: 10, total: 1010, currency: "HTG" });
  });

  it("adds the fixed fee and provider fee", () => {
    const config = { ...DEFAULT_FEE_CONFIG, fixedFee: { HTG: 5, USD: 0.1 }, providerFeeBps: 50 };
    expect(computeQuote(1000, "HTG", config).fee).toBe(20); // 1% + 0.5% of 1000 + 5
    expect(computeQuote(100, "USD", config).fee).toBe(1.6); // 1.5 + 0.1
  });

  it("rounds to 2 decimals without float drift", () => {
    expect(computeQuote(0.3, "USD", { ...DEFAULT_FEE_CONFIG, percentageBps: 100 }).fee).toBe(0);
    expect(computeQuote(333.33, "HTG", DEFAULT_FEE_CONFIG).fee).toBe(3.33);
  });

  it("rejects amounts outside the allowed range with INVALID_AMOUNT", () => {
    expect(() => assertAmountInRange(-5, "HTG", DEFAULT_FEE_CONFIG)).toThrow(expect.objectContaining({ code: "INVALID_AMOUNT" }));
    expect(() => assertAmountInRange(1, "HTG", DEFAULT_FEE_CONFIG)).toThrow(expect.objectContaining({ code: "INVALID_AMOUNT" }));
    expect(() => assertAmountInRange(99_999_999, "HTG", DEFAULT_FEE_CONFIG)).toThrow(expect.objectContaining({ code: "INVALID_AMOUNT" }));
    expect(() => assertAmountInRange(1000, "HTG", DEFAULT_FEE_CONFIG)).not.toThrow();
  });
});
