-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 216: tira `awaiting_crew` da lista de status aceitos.
--
-- ⚠️ DESTRUTIVO PARA VIAGEM EM `awaiting_crew`: sem apagar essas linhas (ou migrá-las para outro
-- status) antes, o `ADD CONSTRAINT` recusa a validação com elas no lugar. Rode só depois de a app
-- já ter voltado à versão anterior a esta spec e de toda viagem `awaiting_crew` ter sido completada
-- ou cancelada — o mesmo cuidado do rollback de `20260926195419_trip_vehicle_optional`.

BEGIN;

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
    WHERE "name" = '20260926202337_trip_awaiting_crew_status';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_awaiting_crew_status migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
