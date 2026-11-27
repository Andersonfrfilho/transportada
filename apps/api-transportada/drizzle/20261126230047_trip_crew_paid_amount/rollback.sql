-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Tira o valor pago informado por pessoa na viagem (spec 327). Os valores já informados se perdem:
-- a valoração volta a usar a diária estimada em toda viagem que tinha valor combinado.
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "trip_drivers" DROP CONSTRAINT "trip_drivers_paid_amount_check";
ALTER TABLE "trip_drivers" DROP COLUMN "paid_amount";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261126230047_trip_crew_paid_amount';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_crew_paid_amount journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
