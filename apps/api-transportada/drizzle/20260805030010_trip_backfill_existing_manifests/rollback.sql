-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the trip-planning backfill (spec 027 T002): every mdfe_manifests.trip_id set by this
-- migration goes back to null, and the trips/trip_drivers rows created for it are removed.
--
-- LIMITAÇÃO CONHECIDA — este rollback só é seguro num ambiente em que a feature 027 não foi usada
-- depois do backfill. Com T005-T011 implementadas, uma viagem criada pelo operador (POST /trips)
-- que emitiu MDF-e também aparece em mdfe_manifests.trip_id, e apagá-la levaria junto, em cascata
-- (trip_documents_company_trip_fk), as notas que o backfill nunca tocou. O schema atual não tem
-- marcador de lote que separe as duas origens com certeza, então em vez de apagar demais o script
-- aborta: as verificações abaixo varrem exatamente as viagens que o DELETE alcançaria e procuram
-- sinal de que alguma nasceu na aplicação. Se disparar, o rollback não é mais automatizável —
-- desfaça a feature 027 pela aplicação antes, ou trate os dados à mão.
BEGIN;

DO $$
DECLARE
  documented_trips integer;
  divergent_trips integer;
BEGIN
  -- O backfill nunca escreve em trip_documents: nota vinculada a uma viagem do lote é sinal de uso
  -- real da feature, e é justamente o dado que a exclusão em cascata levaria embora.
  SELECT count(DISTINCT "t"."id") INTO documented_trips
  FROM "trips" "t"
  JOIN "mdfe_manifests" "m" ON "m"."trip_id" = "t"."id"
  WHERE EXISTS (SELECT 1 FROM "trip_documents" "d" WHERE "d"."trip_id" = "t"."id");

  -- O backfill copia created_at do manifesto; a viagem criada pelo operador nasce antes do dele.
  SELECT count(DISTINCT "t"."id") INTO divergent_trips
  FROM "trips" "t"
  JOIN "mdfe_manifests" "m" ON "m"."trip_id" = "t"."id"
  WHERE "t"."created_at" <> "m"."created_at";

  IF documented_trips > 0 OR divergent_trips > 0 THEN
    RAISE EXCEPTION
      'Refusing to roll back the trip backfill: % trips carry linked documents and % were created outside the backfill',
      documented_trips, divergent_trips;
  END IF;
END
$$;

CREATE TEMP TABLE "trip_backfill_rollback_ids" ON COMMIT DROP AS
SELECT "trip_id" FROM "mdfe_manifests" WHERE "trip_id" IS NOT NULL;

UPDATE "mdfe_manifests"
SET "trip_id" = NULL
WHERE "trip_id" IN (SELECT "trip_id" FROM "trip_backfill_rollback_ids");

DELETE FROM "trip_drivers"
WHERE "trip_id" IN (SELECT "trip_id" FROM "trip_backfill_rollback_ids");

DELETE FROM "trips"
WHERE "id" IN (SELECT "trip_id" FROM "trip_backfill_rollback_ids");

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260805030010_trip_backfill_existing_manifests'
      AND "hash" = '60a1a572a877b6113f83108bf3eca6b5d11982776bf7f026d8afa75fc4ff95d7';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_backfill_existing_manifests migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
