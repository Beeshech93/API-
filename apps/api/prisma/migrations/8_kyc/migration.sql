-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "KycAccountType" AS ENUM ('INDIVIDUAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "KycDocumentType" AS ENUM ('ID_FRONT', 'ID_BACK', 'SELFIE', 'PROOF_OF_ADDRESS', 'BUSINESS_REGISTRATION');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "kyc_review_note" TEXT,
ADD COLUMN     "kyc_reviewed_at" TIMESTAMP(3),
ADD COLUMN     "kyc_reviewed_by" TEXT,
ADD COLUMN     "kyc_status" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "kyc_submitted_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "kyc_profiles" (
    "client_id" TEXT NOT NULL,
    "account_type" "KycAccountType" NOT NULL,
    "full_name" TEXT NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'HT',
    "id_type" TEXT NOT NULL,
    "id_number_sealed" JSONB NOT NULL,
    "id_number_last4" TEXT NOT NULL,
    "website_url" TEXT NOT NULL,
    "website_status" INTEGER,
    "website_checked_at" TIMESTAMP(3),
    "business_name" TEXT,
    "business_description" TEXT NOT NULL,
    "expected_volume" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_profiles_pkey" PRIMARY KEY ("client_id")
);

-- CreateTable
CREATE TABLE "kyc_documents" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "type" "KycDocumentType" NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kyc_documents_client_id_type_key" ON "kyc_documents"("client_id", "type");

-- AddForeignKey
ALTER TABLE "kyc_profiles" ADD CONSTRAINT "kyc_profiles_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Accounts that already had LIVE access before KYC existed keep it (grandfathered); everyone
-- else must be verified before they can use real money.
UPDATE "clients"
SET "kyc_status" = 'APPROVED', "kyc_reviewed_at" = NOW(), "kyc_review_note" = 'Existing account: LIVE access granted before identity verification was introduced.'
WHERE "live_enabled" = true;
