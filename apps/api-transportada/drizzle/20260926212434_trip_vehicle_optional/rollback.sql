-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 216: exige `vehicle_id` de novo e tira `awaiting_crew` da lista de status.
--
-- ⚠️ DESTRUTIVO PARA VIAGEM EM `awaiting_crew` (com ou sem veículo): qualquer linha `awaiting_crew`
-- ou sem `vehicle_id` impede os dois `ADD CONSTRAINT` abaixo — o rollback falha ruidosamente em vez
-- de apagar viagem, então rode só depois de a app já ter voltado à versão anterior a esta spec e de
-- toda viagem `awaiting_crew` pendente ter sido completada ou cancelada.

BEGIN;

ALTER TABLE "trips" ALTER COLUMN "vehicle_id" SET NOT NULL;

ALTER TABLE "trips" DROP CONSTRAINT "trips_status_check";
ALTER TABLE "trips" ADD CONSTRAINT "trips_status_check"
  CHECK ("status" in ('draft', 'route_planned', 'separating', 'loading', 'dispatched', 'in_transit', 'on_delivery_route', 'completed', 'cancelled'));

ALTER TABLE "trip_status_events" DROP CONSTRAINT "trip_status_events_from_status_check";
ALTER TABLE "trip_status_events" ADD CONSTRAINT "trip_status_events_from_status_check"
  CHECK ("from_status" in ('draft', 'route_planned', 'separating', 'loading', 'dispatched', 'in_transit', 'on_delivery_route', 'completed', 'cancelled'));

ALTER TABLE "trip_status_events" DROP CONSTRAINT "trip_status_events_to_status_check";
ALTER TABLE "trip_status_events" ADD CONSTRAINT "trip_status_events_to_status_check"
  CHECK ("to_status" in ('draft', 'route_planned', 'separating', 'loading', 'dispatched', 'in_transit', 'on_delivery_route', 'completed', 'cancelled'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260926212434_trip_vehicle_optional';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_vehicle_optional migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
