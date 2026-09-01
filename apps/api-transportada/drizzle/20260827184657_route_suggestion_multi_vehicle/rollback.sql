-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a spec 058 P2: a frota, o pool de notas, a ligacao parada-nota e o veiculo por parada
-- da sugestao multi-veiculo.
--
-- E **quebra** se existir sugestao multi-veiculo ainda por decidir: apagar o pool em silencio
-- deixaria uma sugestao `queued`/`ready` sem as notas que ela propoe distribuir, e o worker a
-- trataria como sugestao de viagem — que ela nao e. Decida (aceite ou rejeite) antes de reverter.
BEGIN;

DO $$
DECLARE
  affected integer;
BEGIN
  SELECT count(*) INTO affected
    FROM "route_suggestions"
    WHERE "trip_id" IS NULL AND "status" IN ('queued', 'running', 'ready');
  IF affected > 0 THEN
    RAISE EXCEPTION 'Undecided multi-vehicle suggestions: %. Accept or reject them before rolling back.', affected;
  END IF;
END
$$;

DROP TABLE IF EXISTS "route_suggestion_stop_documents";
DROP TABLE IF EXISTS "route_suggestion_documents";
DROP TABLE IF EXISTS "route_suggestion_vehicles";

ALTER TABLE "route_suggestion_stops" DROP COLUMN IF EXISTS "vehicle_id";
ALTER TABLE "route_suggestion_stops" DROP CONSTRAINT IF EXISTS "route_suggestion_stops_company_id_id_unique";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260827184657_route_suggestion_multi_vehicle'
      AND "hash" = '1e7fa78d69b30779ab681bda521d9b5d75b9b3c568a4221efb2e10bf01c22330';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one route_suggestion_multi_vehicle migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
