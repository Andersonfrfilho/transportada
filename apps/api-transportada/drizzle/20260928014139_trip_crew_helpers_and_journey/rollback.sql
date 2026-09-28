-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 149 (ADR-0065): tripulação com papel (motorista/ajudante), diária do ajudante
-- (própria e geral da empresa), jornada congelada com a volta, e a sugestão multi-veículo com
-- ajudantes e motorista recomendado.
--
-- ⚠️ Este rollback FALHA se qualquer coluna ou tabela nova já tiver dado gravado que ele apagaria:
-- ajudante na tripulação, diária própria ou geral configurada, jornada congelada, ou fonte do
-- motorista da sugestão. Nesse caso não desfaz — a migration nova só alargou o que já existia.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "trip_drivers" WHERE "role" = 'helper') THEN
    RAISE EXCEPTION 'trip_drivers has helper rows, refusing rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM "fleet_drivers" WHERE "can_act_as_helper" = true) THEN
    RAISE EXCEPTION 'fleet_drivers has can_act_as_helper rows, refusing rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM "fleet_drivers" WHERE "helper_daily_rate" IS NOT NULL) THEN
    RAISE EXCEPTION 'fleet_drivers has helper_daily_rate rows, refusing rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM "route_suggestion_vehicles" WHERE "driver_source" IS NOT NULL) THEN
    RAISE EXCEPTION 'route_suggestion_vehicles has driver_source rows, refusing rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM "trips" WHERE "planned_journey_seconds" IS NOT NULL) THEN
    RAISE EXCEPTION 'trips has planned_journey_seconds rows, refusing rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM "trip_financial_parcels" WHERE "kind" = 'helper') THEN
    RAISE EXCEPTION 'trip_financial_parcels has helper rows, refusing rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM "company_crew_settings") THEN
    RAISE EXCEPTION 'company_crew_settings has rows, refusing rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM "driver_assignment_feedback") THEN
    RAISE EXCEPTION 'driver_assignment_feedback has rows, refusing rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM "route_suggestion_vehicle_helpers") THEN
    RAISE EXCEPTION 'route_suggestion_vehicle_helpers has rows, refusing rollback';
  END IF;
END $$;

ALTER TABLE "trip_financial_parcels" DROP CONSTRAINT "trip_financial_parcels_kind_check";
ALTER TABLE "trip_financial_parcels" ADD CONSTRAINT "trip_financial_parcels_kind_check"
  CHECK ("kind" in ('driver', 'fuel', 'other_per_kilometer', 'delivery_charges', 'toll', 'manual', 'icms', 'pis_cofins'));

ALTER TABLE "trips" DROP CONSTRAINT "trips_planned_journey_seconds_check";
ALTER TABLE "trips" DROP CONSTRAINT "trips_planned_journey_check";
ALTER TABLE "trip_drivers" DROP CONSTRAINT "trip_drivers_lead_role_check";
ALTER TABLE "trip_drivers" DROP CONSTRAINT "trip_drivers_role_check";
ALTER TABLE "route_suggestion_vehicles" DROP CONSTRAINT "route_suggestion_vehicles_driver_source_check";
ALTER TABLE "fleet_drivers" DROP CONSTRAINT "fleet_drivers_helper_daily_rate_check";

ALTER TABLE "route_suggestion_vehicle_helpers" DROP CONSTRAINT "route_suggestion_vehicle_helpers_driver_fk";
ALTER TABLE "route_suggestion_vehicle_helpers" DROP CONSTRAINT "route_suggestion_vehicle_helpers_vehicle_fk";
ALTER TABLE "route_suggestion_vehicle_helpers" DROP CONSTRAINT "route_suggestion_vehicle_helpers_company_id_companies_id_fk";
ALTER TABLE "driver_assignment_feedback" DROP CONSTRAINT "driver_assignment_feedback_actor_membership_fk";
ALTER TABLE "driver_assignment_feedback" DROP CONSTRAINT "driver_assignment_feedback_chosen_driver_fk";
ALTER TABLE "driver_assignment_feedback" DROP CONSTRAINT "driver_assignment_feedback_recommended_driver_fk";
ALTER TABLE "driver_assignment_feedback" DROP CONSTRAINT "driver_assignment_feedback_vehicle_fk";
ALTER TABLE "driver_assignment_feedback" DROP CONSTRAINT "driver_assignment_feedback_suggestion_fk";
ALTER TABLE "driver_assignment_feedback" DROP CONSTRAINT "driver_assignment_feedback_company_id_companies_id_fk";
ALTER TABLE "company_crew_settings" DROP CONSTRAINT "company_crew_settings_company_id_companies_id_fkey";

DROP INDEX "driver_assignment_feedback_company_vehicle_created_idx";
ALTER TABLE "route_suggestion_vehicles" DROP CONSTRAINT "route_suggestion_vehicles_company_suggestion_vehicle_unique";

ALTER TABLE "trips" DROP COLUMN "planned_journey_includes_return";
ALTER TABLE "trips" DROP COLUMN "planned_journey_seconds";
ALTER TABLE "trip_drivers" DROP COLUMN "role";
ALTER TABLE "route_suggestion_vehicles" DROP COLUMN "driver_source";
ALTER TABLE "fleet_drivers" DROP COLUMN "helper_daily_rate";
ALTER TABLE "fleet_drivers" DROP COLUMN "can_act_as_helper";

DROP TABLE "route_suggestion_vehicle_helpers";
DROP TABLE "driver_assignment_feedback";
DROP TABLE "company_crew_settings";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260928014139_trip_crew_helpers_and_journey';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_crew_helpers_and_journey journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
