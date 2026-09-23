export const PaymentHelpers = {
  // A fresh Idempotency-Key per attempt from the console.
  newKey: () => `console-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
};
