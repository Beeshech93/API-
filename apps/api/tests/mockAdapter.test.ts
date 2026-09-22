import { monCashAdapter } from "@/providers/moncash/moncash.adapter";
import { natCashAdapter } from "@/providers/natcash/natcash.adapter";
import * as mock from "@/providers/mockTransport";

describe.each([
  ["MonCash", monCashAdapter],
  ["NatCash", natCashAdapter],
] as const)("%s mock adapter", (_label, adapter) => {
  it("creates a payment, settles it, and produces a verifiable signed webhook", async () => {
    const created = await adapter.createPayment(
      { amount: 500, currency: "HTG", reference: "order_1" },
      null
    );
    expect(created.providerPaymentId).toMatch(/^mock_/);
    expect(created.checkoutUrl).toContain(created.providerPaymentId);

    const pending = await adapter.getPaymentStatus(created.providerPaymentId, null);
    expect(pending.status).toBe("PENDING");

    const event = mock.settleMockPayment(created.providerPaymentId, "success");
    expect(event.status).toBe("SUCCEEDED");

    const { body, signature } = mock.buildSignedMockWebhook(event);
    expect(mock.verifyMockWebhookSignature(body, signature)).toBe(true);
    expect(mock.verifyMockWebhookSignature(body, "tampered")).toBe(false);

    const parsed = adapter.parseWebhookPayload(JSON.parse(body));
    expect(parsed.providerPaymentId).toBe(created.providerPaymentId);
    expect(parsed.status).toBe("SUCCEEDED");

    const settled = await adapter.getPaymentStatus(created.providerPaymentId, null);
    expect(settled.status).toBe("SUCCEEDED");
  });

  it("throws PROVIDER_NOT_CONFIGURED when called with live credentials (unimplemented)", async () => {
    await expect(
      adapter.createPayment(
        { amount: 100, currency: "USD", reference: "order_2" },
        { clientId: "x", clientSecret: "y", webhookSecret: "z" }
      )
    ).rejects.toMatchObject({ code: "PROVIDER_NOT_CONFIGURED" });
  });
});
