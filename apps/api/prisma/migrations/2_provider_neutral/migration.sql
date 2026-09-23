-- The payment integrator's identity is no longer hard-coded: its row is keyed
-- "primary" and its display name comes from backend configuration.
UPDATE "providers" SET "code" = 'primary', "name" = 'Payment provider' WHERE "code" = 'bazik';
UPDATE "provider_logs" SET "provider_code" = 'primary' WHERE "provider_code" = 'bazik';
