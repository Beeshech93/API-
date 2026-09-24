-- CreateEnum
CREATE TYPE "FundingMethod" AS ENUM ('MONCASH', 'NATCASH', 'ZELLE', 'BANK_DEPOSIT', 'BANK_TRANSFER', 'CRYPTO_USDT');

-- CreateEnum
CREATE TYPE "FundingStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REJECTED');

-- CreateTable
CREATE TABLE "fundings" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "method" "FundingMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "credited_amount" DECIMAL(14,2),
    "currency" "Currency" NOT NULL DEFAULT 'HTG',
    "status" "FundingStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "note" TEXT,
    "provider_transaction_id" TEXT,
    "payment_url" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "request_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fundings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fundings_client_id_created_at_idx" ON "fundings"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "fundings_provider_transaction_id_idx" ON "fundings"("provider_transaction_id");

-- CreateIndex
CREATE INDEX "fundings_status_idx" ON "fundings"("status");

-- AddForeignKey
ALTER TABLE "fundings" ADD CONSTRAINT "fundings_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

