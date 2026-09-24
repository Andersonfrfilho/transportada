-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 164 T9 (correção do `architect`): `trip_occurrence_case_events.actor_user_id`
-- volta a ser nulável. Não recusa por linha presente — a coluna só passa de NOT NULL para nulável,
-- e nenhum dado se perde nesse sentido.
BEGIN;

ALTER TABLE "trip_occurrence_case_events" ALTER COLUMN "actor_user_id" DROP NOT NULL;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260922203040_occurrence_case_event_actor_required'
      AND "hash" = '0596f1b766d55b4afa203ee5dad9c6d76eea80c6f68b836914be171c6d89baa7';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_case_event_actor_required migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
