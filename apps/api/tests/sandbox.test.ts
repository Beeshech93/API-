import { BazikSandbox, SANDBOX_TEST_NUMBERS } from "@/providers/bazik.sandbox";
import { BazikService } from "@/providers/bazik.service";
import { getProvider } from "@/providers/provider.factory";

const input = (phone: string) => ({ network: "MONCASH" as const, amount: 500, currency: "HTG" as const, phone, requestId: "req_test" });

describe("sandbox provider (never moves real money)", () => {
  const sandbox = new BazikSandbox();

  it("completes, fails, or stays pending based on the test number", async () => {
    expect((await sandbox.createPayment(input(SANDBOX_TEST_NUMBERS.completed))).status).toBe("COMPLETED");
    expect((await sandbox.createPayment(input(SANDBOX_TEST_NUMBERS.failed))).status).toBe("FAILED");
    expect((await sandbox.createPayment(input("50937000000"))).status).toBe("PENDING");
  });

  it("simulates insufficient balance and provider timeouts", async () => {
    await expect(sandbox.createPayment(input(SANDBOX_TEST_NUMBERS.insufficientBalance))).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
    await expect(sandbox.createPayment(input(SANDBOX_TEST_NUMBERS.timeout))).rejects.toMatchObject({ code: "PROVIDER_TIMEOUT" });
  });

  it("marks sandbox transaction ids so they can't be mistaken for real ones", async () => {
    expect((await sandbox.createPayment(input("50937000000"))).providerTransactionId).toMatch(/^sbx_moncash_/);
  });
});

describe("environment routing", () => {
  it("routes TEST to the sandbox and LIVE to Bazik", () => {
    expect(getProvider("TEST")).toBeInstanceOf(BazikSandbox);
    expect(getProvider("LIVE")).toBeInstanceOf(BazikService);
  });

  it("LIVE fails closed instead of inventing provider calls", async () => {
    await expect(getProvider("LIVE").createPayment(input("50937000000"))).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });
});
