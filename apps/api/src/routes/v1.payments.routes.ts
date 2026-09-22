import { Router } from "express";
import { asyncHandler } from "@/utils/asyncHandler";
import { requireApiKey, requireTestMode } from "@/middleware/auth.apikey";
import { apiKeyRateLimiter } from "@/middleware/rateLimit";
import { AppError } from "@/utils/errors";
import { createPaymentSchema, simulatePaymentSchema } from "@/validators/payment.validators";
import * as paymentService from "@/services/payment.service";

export const v1PaymentsRouter = Router();
v1PaymentsRouter.use(requireApiKey, apiKeyRateLimiter);

v1PaymentsRouter.post(
  "/payments",
  asyncHandler(async (req, res) => {
    const input = createPaymentSchema.parse(req.body);
    const idempotencyKey = req.header("Idempotency-Key") ?? undefined;
    const transaction = await paymentService.createPayment(req.apiKey!, input, idempotencyKey);
    res.status(201).json(paymentService.toTransactionDto(transaction));
  })
);

v1PaymentsRouter.get(
  "/payments",
  asyncHandler(async (req, res) => {
    const transactions = await paymentService.listPayments(req.apiKey!.applicationId, {
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      provider: typeof req.query.provider === "string" ? req.query.provider : undefined,
    });
    res.json(transactions.map(paymentService.toTransactionDto));
  })
);

v1PaymentsRouter.get(
  "/payments/:id",
  asyncHandler(async (req, res) => {
    const transaction = await paymentService.getPayment(req.apiKey!.applicationId, req.params.id);
    res.json(paymentService.toTransactionDto(transaction));
  })
);

v1PaymentsRouter.post(
  "/payments/:id/refunds",
  asyncHandler(async () => {
    // Refund support is unconfirmed for either provider's real API — see the
    // plan's "Assumptions / open items". Kept as a clearly-typed 501 rather
    // than a silent no-op so client SDKs can branch on it correctly.
    throw AppError.notImplemented(
      "Refunds are not yet supported — the underlying provider's refund contract is unconfirmed.",
      "REFUND_NOT_SUPPORTED"
    );
  })
);

v1PaymentsRouter.post(
  "/sandbox/payments/:id/simulate",
  requireTestMode,
  asyncHandler(async (req, res) => {
    const input = simulatePaymentSchema.parse(req.body);
    const transaction = await paymentService.simulatePayment(req.apiKey!, req.params.id, input.outcome);
    res.json(paymentService.toTransactionDto(transaction));
  })
);
