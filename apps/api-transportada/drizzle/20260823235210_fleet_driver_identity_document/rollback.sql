-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Retira da ficha do motorista o trio "DOC. IDENTIDADE / ÓRG. EMISSOR / UF" que a CNH imprime.
-- Perde o que foi digitado — o RG não é derivável do resto da linha.
BEGIN;

ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_identity_document_check";

ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_identity_document_state_check";

ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_identity_document_issuer_check";

ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "identity_document_state";

ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "identity_document_issuer";

ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "identity_document";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260823235210_fleet_driver_identity_document'
      AND "hash" = 'd325709a2ce67d650ddaf40fc17b7bb5e9381a1eb67c06dc7b0624aa81aeb9b0';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_driver_identity_document migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
