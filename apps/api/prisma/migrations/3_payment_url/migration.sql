-- Where the payer completes a LIVE payment (set when the provider returns a hosted payment page).
ALTER TABLE "transactions" ADD COLUMN "payment_url" TEXT;
