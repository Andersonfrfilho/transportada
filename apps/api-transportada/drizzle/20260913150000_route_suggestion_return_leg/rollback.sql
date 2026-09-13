-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Tira a volta ao barracão da proposta. ⚠️ As voltas gravadas **se perdem**: elas nascem no
-- worker e não ficam em lugar nenhum além desta linha — o tempo da proposta volta a sair sem a
-- volta, declarada desconhecida. Reverter só com o worker também revertido — senão ele escreve
-- numa coluna que não existe e a sugestão falha.
BEGIN;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260913150000_route_suggestion_return_leg';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one route_suggestion_return_leg journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

ALTER TABLE "route_suggestion_vehicles"
  DROP CONSTRAINT IF EXISTS "route_suggestion_vehicles_return_leg_check";

ALTER TABLE "route_suggestion_vehicles"
  DROP COLUMN IF EXISTS "return_distance_meters",
  DROP COLUMN IF EXISTS "return_duration_seconds";

COMMIT;
