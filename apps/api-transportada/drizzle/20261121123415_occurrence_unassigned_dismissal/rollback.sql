-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Tira as colunas de descarte da fila de mensagens sem conversa. As descartadas voltam a aparecer na fila.
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "occurrence_conversation_unassigned" DROP CONSTRAINT "occurrence_conversation_unassigned_dismissal_check";
ALTER TABLE "occurrence_conversation_unassigned" DROP CONSTRAINT "occurrence_conversation_unassigned_dismissed_by_user_fk";
DROP INDEX "occurrence_conversation_unassigned_open_idx";
CREATE INDEX "occurrence_conversation_unassigned_open_idx" ON "occurrence_conversation_unassigned" ("company_id","received_at") WHERE "assigned_message_id" is null;
ALTER TABLE "occurrence_conversation_unassigned" DROP COLUMN "dismissed_by_user_id";
ALTER TABLE "occurrence_conversation_unassigned" DROP COLUMN "dismissed_at";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261121123415_occurrence_unassigned_dismissal';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_unassigned_dismissal journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
