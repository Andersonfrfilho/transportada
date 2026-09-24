-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 179 T201 (RF2/RF2a/RF2b): a tabela `trip_occurrence_uploads` — o link entre a URL
-- assinada de upload que o app pediu e a viagem que pediu, que `stored_objects` não guarda (só tem
-- `company_id`, nunca viagem).
--
-- O que se perde: qualquer pedido de upload pendente ou confirmado ainda não referenciado por uma
-- ocorrência. Nenhuma outra tabela referencia esta — é uma tabela nova, sem FK entrando nela.

BEGIN;

DROP TABLE "trip_occurrence_uploads";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260923215639_trip_occurrence_uploads';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_occurrence_uploads migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
