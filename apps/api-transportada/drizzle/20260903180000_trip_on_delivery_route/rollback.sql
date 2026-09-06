-- Devolve o CHECK anterior. ⚠️ Ele **recusa** as linhas que já estiverem em `on_delivery_route`, e é
-- por isso que elas voltam antes para `in_transit`: o estado anterior mais próximo, e o que a
-- derivação de antes da ADR-0058 produziria para uma viagem com nota fechada. O toque de "iniciar
-- trajeto" se perde — ele não tem coluna própria, é o estado.
UPDATE "trips" SET "status" = 'in_transit' WHERE "status" = 'on_delivery_route';

ALTER TABLE "trips" DROP CONSTRAINT IF EXISTS "trips_status_check";

ALTER TABLE "trips" ADD CONSTRAINT "trips_status_check" CHECK ("status" in ('draft', 'route_planned', 'separating', 'loading', 'dispatched', 'in_transit', 'completed', 'cancelled'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260903180000_trip_on_delivery_route';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_on_delivery_route journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;
