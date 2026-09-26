-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a fase A da spec 215. **Não é destrutivo e não devolve nada ao banco**: a fase A só tirou
-- `latitude`, `longitude` e `geocoding_precision` do schema TS de `trip_stops` — as colunas
-- continuam na tabela, nulas, até a fase B. Voltar o código é reverter o commit; aqui só sai a
-- linha do journal, para o próximo `db:migrate` reaplicar a migration em vez de pulá-la.

BEGIN;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260926214201_trip_stops_forget_dead_coordinates';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_stops_forget_dead_coordinates journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
