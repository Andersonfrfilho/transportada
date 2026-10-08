-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 257 T1.2: remove `trip_document_link_events` e o trigger append-only que nasceu com ela.
-- ⚠️ Recusa rodar enquanto existir um vínculo gravado: o evento é a única prova de quem acrescentou as
-- notas à viagem na rua e por quê.
-- Confira antes: select trip_id, created_at, reason from trip_document_link_events order by created_at;
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  recorded_links integer;
BEGIN
  SELECT count(*) INTO recorded_links FROM "trip_document_link_events";

  IF recorded_links > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: % document link(s) would lose their history',
      recorded_links;
  END IF;
END
$$;

DROP TRIGGER "trip_document_link_events_append_only_trigger" ON "trip_document_link_events";
DROP FUNCTION "reject_trip_document_link_events_mutation"();

DROP TABLE "trip_document_link_events";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261008161749_trip_document_link_events';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_document_link_events journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
