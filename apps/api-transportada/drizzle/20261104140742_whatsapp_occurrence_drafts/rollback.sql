-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 293 T15: remove as ocorrências em coleta pelo WhatsApp. As abertas se perdem (os uploads de foto já confirmados ficam sem ocorrência, como o upload que o app confirma e não usa).
BEGIN;

SET LOCAL lock_timeout = '3s';

DROP TABLE "whatsapp_occurrence_drafts";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261104140742_whatsapp_occurrence_drafts';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one whatsapp_occurrence_drafts journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
