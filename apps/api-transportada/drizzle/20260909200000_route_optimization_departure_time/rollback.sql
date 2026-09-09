-- ⚠️ Devolve o esquema e, com ele, o defeito: sem a hora de partida o relógio do solver volta a
-- começar à meia-noite UTC, e as chegadas voltam a cair de madrugada.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260909200000_route_optimization_departure_time';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one route_optimization_departure_time journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

ALTER TABLE "company_route_optimization_settings"
  DROP CONSTRAINT IF EXISTS "company_route_optimization_settings_departure_check";

ALTER TABLE "company_route_optimization_settings"
  DROP COLUMN IF EXISTS "departure_time_seconds";
