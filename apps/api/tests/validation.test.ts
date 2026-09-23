import { createKeySchema, createPaymentSchema, idempotencyKeySchema, signupSchema } from "@/validators/schemas";

describe("request validation", () => {
  it("normalizes Haitian phone numbers", () => {
    const parsed = createPaymentSchema.parse({ amount: 1000, currency: "HTG", phone: "+509 3712-3456" });
    expect(parsed.phone).toBe("50937123456");
  });

  it("rejects bad phones, amounts and currencies", () => {
    expect(() => createPaymentSchema.parse({ amount: 10, currency: "HTG", phone: "12345" })).toThrow();
    expect(() => createPaymentSchema.parse({ amount: -1, currency: "HTG", phone: "50937123456" })).toThrow();
    expect(() => createPaymentSchema.parse({ amount: 10, currency: "EUR", phone: "50937123456" })).toThrow();
  });

  it("requires a well-formed Idempotency-Key", () => {
    expect(() => idempotencyKeySchema.parse(undefined)).toThrow();
    expect(() => idempotencyKeySchema.parse("bad key with spaces")).toThrow();
    expect(idempotencyKeySchema.parse("order-12345")).toBe("order-12345");
  });

  it("enforces a strong password and known permissions", () => {
    expect(() => signupSchema.parse({ email: "a@b.co", password: "short", name: "A" })).toThrow();
    expect(() => createKeySchema.parse({ name: "k", environment: "LIVE", permissions: ["admin:everything"] })).toThrow();
    expect(createKeySchema.parse({ name: "k", environment: "TEST", permissions: ["payments:create"] }).environment).toBe("TEST");
  });
});
