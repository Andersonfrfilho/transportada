-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 341: remove os dados opcionais do pedido de coleta (contato nas pontas, acesso e valor da mercadoria).
--
-- ⚠️ Recusa quando algum pedido já guarda um desses dados: apagar perderia o que o cliente informou.
BEGIN;

DO $$
DECLARE
  filled bigint;
BEGIN
  SELECT count(*) INTO filled FROM "pickup_requests"
    WHERE "origin_contact_name" IS NOT NULL OR "origin_contact_phone" IS NOT NULL
      OR "destination_contact_name" IS NOT NULL OR "destination_contact_phone" IS NOT NULL
      OR "access_notes" IS NOT NULL OR "cargo_value" IS NOT NULL;
  IF filled > 0 THEN
    RAISE EXCEPTION 'Refusing rollback: % pickup request(s) hold the optional fields', filled;
  END IF;
END
$$;

ALTER TABLE "pickup_requests"
  DROP COLUMN "origin_contact_name",
  DROP COLUMN "origin_contact_phone",
  DROP COLUMN "destination_contact_name",
  DROP COLUMN "destination_contact_phone",
  DROP COLUMN "access_notes",
  DROP COLUMN "cargo_value";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261115160000_pickup_request_extras';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one pickup_request_extras journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
