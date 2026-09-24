-- AlterEnum
ALTER TYPE "FundingMethod" ADD VALUE 'SANDBOX';

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "can_receive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "can_send" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "fundings" ADD COLUMN     "environment" "ApiEnvironment" NOT NULL DEFAULT 'LIVE';

