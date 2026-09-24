-- CreateEnum
CREATE TYPE "ApiKeyCategory" AS ENUM ('RECEIVE', 'SEND', 'BOTH');

-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "category" "ApiKeyCategory" NOT NULL DEFAULT 'RECEIVE';


-- Existing keys keep working: classify them from what they can do.
--   both payments and transfers permissions -> BOTH (created before keys were split)
--   transfers only                           -> SEND
--   payments only                            -> RECEIVE
--   neither (balance/transactions only)      -> follow the account: send-only accounts get SEND
UPDATE "api_keys" AS k SET "category" = CASE
  WHEN k."permissions" && ARRAY['payments:create','payments:read']::text[] AND k."permissions" && ARRAY['transfers:create','transfers:read']::text[] THEN 'BOTH'::"ApiKeyCategory"
  WHEN k."permissions" && ARRAY['transfers:create','transfers:read']::text[] THEN 'SEND'::"ApiKeyCategory"
  WHEN k."permissions" && ARRAY['payments:create','payments:read']::text[] THEN 'RECEIVE'::"ApiKeyCategory"
  WHEN EXISTS (SELECT 1 FROM "clients" c WHERE c."id" = k."client_id" AND c."can_send" AND NOT c."can_receive") THEN 'SEND'::"ApiKeyCategory"
  ELSE 'RECEIVE'::"ApiKeyCategory"
END;
