-- Plans are gone: LIVE access is now enabled per client by an administrator.
-- Existing clients keep what they had: paid (ACTIVE) subscribers and administrators are enabled.
ALTER TABLE "clients" ADD COLUMN "live_enabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "clients" SET "live_enabled" = true
WHERE "id" IN (SELECT "client_id" FROM "subscriptions" WHERE "status" = 'ACTIVE')
   OR "id" IN (SELECT "client_id" FROM "users" WHERE "role" = 'ADMIN');
