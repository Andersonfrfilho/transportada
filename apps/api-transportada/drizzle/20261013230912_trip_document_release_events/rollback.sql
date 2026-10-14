-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove a tabela `trip_document_release_events`: o histórico de quem retirou nota ou parada de uma viagem.
-- ⚠️ Recusa rodar enquanto existir um evento gravado: a linha é a única prova de quem retirou a nota e por quê.
-- Confira antes: select trip_id, scope, created_at from trip_document_release_events order by created_at desc;
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  recorded_events integer;
BEGIN
  SELECT count(*) INTO recorded_events FROM "trip_document_release_events";

  IF recorded_events > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: % release event(s) would lose their history',
      recorded_events;
  END IF;
END
$$;

DROP TABLE "trip_document_release_events";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261013230912_trip_document_release_events';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_document_release_events journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
