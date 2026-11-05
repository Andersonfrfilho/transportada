-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 294 T3.1: recoloca a FK. Falha de propósito se houver sugestão de endereço sem linha em geocoded_addresses (apague-as antes).
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "address_correction_suggestions" ADD CONSTRAINT "address_correction_suggestions_address_key_fk" FOREIGN KEY ("address_key") REFERENCES "geocoded_addresses"("address_key") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261105112915_address_suggestion_address_key_without_fk';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one address_suggestion_address_key_without_fk journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
