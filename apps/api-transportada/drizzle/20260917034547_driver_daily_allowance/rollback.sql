-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 143 T1 (a diária do motorista, os dias da viagem e o valor geral da empresa).
--
-- ⚠️ Este rollback FALHA se alguma diária já tiver sido combinada, se alguma viagem já tiver
-- número de diárias informado, ou se alguma empresa já tiver configurado o valor geral — os três
-- nascem nesta migration, e apagá-los com dado dentro apagaria decisão de dinheiro que ninguém
-- consegue reconstruir do histórico.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "fleet_drivers" WHERE "daily_allowance_amount" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'fleet_drivers has rows with daily_allowance_amount set, refusing rollback';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "trips" WHERE "daily_allowance_days" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'trips has rows with daily_allowance_days set, refusing rollback';
  END IF;

  IF EXISTS (SELECT 1 FROM "company_driver_allowance_settings") THEN
    RAISE EXCEPTION 'company_driver_allowance_settings has rows, refusing rollback';
  END IF;
END
$$;

DROP TABLE "company_driver_allowance_settings";

ALTER TABLE "trips" DROP CONSTRAINT "trips_daily_allowance_days_check";
ALTER TABLE "fleet_drivers" DROP CONSTRAINT "fleet_drivers_daily_allowance_check";

ALTER TABLE "trips" DROP COLUMN "daily_allowance_days";
ALTER TABLE "fleet_drivers" DROP COLUMN "daily_allowance_amount";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260917034547_driver_daily_allowance';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one driver_daily_allowance journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
