-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 249 T1.3: remove `trip_crew_events` e o trigger append-only que nasceu com ela.
-- ⚠️ Recusa rodar enquanto existir uma transferência gravada: o evento é a única prova de quem saiu,
-- quem entrou, por quê e quanto o custo mudou — e a tripulação já foi trocada em `trip_drivers`.
-- Confira antes: select trip_id, created_at, reason from trip_crew_events order by created_at;
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  recorded_transfers integer;
BEGIN
  SELECT count(*) INTO recorded_transfers FROM "trip_crew_events";

  IF recorded_transfers > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: % crew transfer(s) would lose their history',
      recorded_transfers;
  END IF;
END
$$;

DROP TRIGGER "trip_crew_events_append_only_trigger" ON "trip_crew_events";
DROP FUNCTION "reject_trip_crew_events_mutation"();

DROP TABLE "trip_crew_events";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261007114250_trip_crew_events';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_crew_events journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
