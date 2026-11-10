-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 321 T2: remove a coleta de canhoto e a marca do tipo com coleta.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar com coleta gravada (é o único registro de que o canhoto ficou com o
-- cliente) ou com tipo marcado (registrá-lo deixaria de criar a coleta sem aviso).
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  stored_pickups integer;
  marked_types integer;
BEGIN
  SELECT count(*) INTO stored_pickups FROM "trip_canhoto_pickups";
  IF stored_pickups > 0 THEN
    RAISE EXCEPTION 'trip_canhoto_pickups has % rows; refusing to drop the spec 321 T2 table', stored_pickups;
  END IF;
  SELECT count(*) INTO marked_types FROM "company_occurrence_types" WHERE "creates_canhoto_pickup";
  IF marked_types > 0 THEN
    RAISE EXCEPTION 'company_occurrence_types has % types creating canhoto pickups; refusing to drop the spec 321 T2 column', marked_types;
  END IF;
END
$$;

DROP TABLE "trip_canhoto_pickups";
ALTER TABLE "company_occurrence_types" DROP COLUMN "creates_canhoto_pickup";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261110220029_canhoto_pickups';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one canhoto_pickups journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
