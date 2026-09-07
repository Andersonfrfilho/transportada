-- Devolve o esquema anterior. ⚠️ A tabela sai com as tarifas: o catálogo é reconstruível a partir
-- do mesmo `.osm.pbf` pelo extrator, e nenhum dado de cliente mora aqui.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260907182129_toll_booths';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one toll_booths journal entry, removed %', deleted_migrations;
  END IF;
END $$;

DROP TABLE IF EXISTS "toll_booths";
