-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove a tripulação com papel, os ajudantes da sugestão e o feedback da escolha (spec 149 T1).
--
-- ⚠️ Ajudante gravado em `trip_drivers` (role = 'helper') vira condutor ao perder a coluna: apague
-- essas linhas antes em ambiente com uso real, ou o MDF-e passa a levá-las como condutor. A diária
-- do ajudante (empresa e motorista) e o feedback da escolha se perdem — exporte antes.
BEGIN;

DROP TABLE IF EXISTS "route_suggestion_vehicle_helpers";
DROP TABLE IF EXISTS "driver_assignment_feedback";
DROP TABLE IF EXISTS "company_crew_settings";

ALTER TABLE "route_suggestion_vehicles"
  DROP CONSTRAINT IF EXISTS "route_suggestion_vehicles_driver_source_check",
  DROP CONSTRAINT IF EXISTS "route_suggestion_vehicles_company_suggestion_vehicle_unique",
  DROP COLUMN IF EXISTS "driver_source";

ALTER TABLE "trip_drivers"
  DROP CONSTRAINT IF EXISTS "trip_drivers_lead_role_check",
  DROP CONSTRAINT IF EXISTS "trip_drivers_role_check",
  DROP COLUMN IF EXISTS "role";

ALTER TABLE "fleet_drivers"
  DROP CONSTRAINT IF EXISTS "fleet_drivers_helper_daily_rate_check",
  DROP COLUMN IF EXISTS "helper_daily_rate",
  DROP COLUMN IF EXISTS "can_act_as_helper";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260915022856_trip_crew_helpers';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_crew_helpers journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
