-- Devolve a coluna ao estado anterior. ⚠️ As razões gravadas **se perdem**: elas nascem no solver e
-- não ficam em lugar nenhum além desta linha — quem reverter volta a ver a carga que não coube
-- rotulada como falta de cobertura de motorista, que manda cadastrar região para resolver tonelagem.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260910090000_route_suggestion_leftover_reason';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one route_suggestion_leftover_reason journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

ALTER TABLE "route_suggestion_stops"
  DROP CONSTRAINT IF EXISTS "route_suggestion_stops_leftover_reason_check";

ALTER TABLE "route_suggestion_stops" DROP COLUMN IF EXISTS "leftover_reason";
