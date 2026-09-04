-- Tabela nova e append-only: derrubar perde as correcoes registradas, e nao ha de onde
-- reconstitui-las. Em base nova isso e vazio; em base com uso, e perda declarada.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260904120000_geocoded_address_corrections';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one geocoded_address_corrections journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

DROP TRIGGER IF EXISTS reject_geocoded_address_corrections_mutation
	ON "geocoded_address_corrections";
DROP FUNCTION IF EXISTS reject_geocoded_address_corrections_mutation();
DROP TABLE IF EXISTS "geocoded_address_corrections";
