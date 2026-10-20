-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 276 T5: tira a resposta automática à contratante. Recusa enquanto algum tipo a usa ou alguma resposta automática
-- já foi registrada (a linha da entrega ficaria fora da CHECK antiga).
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "company_occurrence_types"
    WHERE "contractor_reply_acknowledgement_quick_reply_id" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Occurrence types still use the contractor acknowledgement; clear it before rolling back';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "occurrence_contractor_reply_deliveries" WHERE "target" = 'contractor_acknowledgement'
  ) THEN
    RAISE EXCEPTION 'Contractor acknowledgements were already recorded; rollback would orphan them';
  END IF;
END
$$;

ALTER TABLE "occurrence_contractor_reply_deliveries" DROP CONSTRAINT "occurrence_contractor_reply_deliveries_target_check",
  ADD CONSTRAINT "occurrence_contractor_reply_deliveries_target_check"
  CHECK ("target" in ('driver_app_chat', 'driver_whatsapp', 'note_recipient_email', 'informed_email'));
ALTER TABLE "company_occurrence_types" DROP COLUMN "contractor_reply_acknowledgement_quick_reply_id";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261020204714_contractor_reply_acknowledgement';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one contractor_reply_acknowledgement journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
