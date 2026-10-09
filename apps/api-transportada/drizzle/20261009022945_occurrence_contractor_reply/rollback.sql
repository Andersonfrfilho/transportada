-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 248 T3.1: remove as três tabelas do retorno, o trigger append-only, os CHECKs e as
-- colunas que a migration acrescentou ao tipo e à exceção da contratante.
-- ⚠️ Recusa rodar enquanto existir um retorno gravado: a linha e seus eventos são a prova do que foi
-- entregue a quem.
-- Confira antes: select occurrence_id, status, created_at from occurrence_contractor_replies;
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  recorded_replies integer;
BEGIN
  SELECT count(*) INTO recorded_replies FROM "occurrence_contractor_replies";

  IF recorded_replies > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: % contractor reply(ies) would lose their history',
      recorded_replies;
  END IF;
END
$$;

DROP TRIGGER "occurrence_contractor_reply_events_append_only_trigger" ON "occurrence_contractor_reply_events";
DROP FUNCTION "reject_occurrence_contractor_reply_events_mutation"();

DROP TABLE "occurrence_contractor_reply_events";
DROP TABLE "occurrence_contractor_reply_deliveries";
DROP TABLE "occurrence_contractor_replies";

ALTER TABLE "company_occurrence_type_contractor_overrides" DROP CONSTRAINT IF EXISTS "occurrence_type_contractor_overrides_reply_mode_check";
ALTER TABLE "company_occurrence_type_contractor_overrides" DROP CONSTRAINT IF EXISTS "occurrence_type_contractor_overrides_reply_wait_hours_check";
ALTER TABLE "company_occurrence_type_contractor_overrides" DROP CONSTRAINT IF EXISTS "occurrence_type_contractor_overrides_forward_note_check";
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT IF EXISTS "company_occurrence_types_contractor_reply_mode_check";
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT IF EXISTS "company_occurrence_types_contractor_reply_attachment_kind_check";
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT IF EXISTS "company_occurrence_types_driver_reply_channel_check";
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT IF EXISTS "company_occurrence_types_driver_reply_window_action_check";
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT IF EXISTS "company_occurrence_types_driver_reply_template_check";
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT IF EXISTS "company_occurrence_types_contractor_reply_wait_hours_check";
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT IF EXISTS "company_occurrence_types_contractor_reply_alert_mode_check";
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT IF EXISTS "company_occurrence_types_contractor_reply_alert_interval_check";
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT IF EXISTS "company_occurrence_types_contractor_reply_alert_max_count_check";
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT IF EXISTS "company_occurrence_types_forward_to_note_recipient_check";
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT IF EXISTS "company_occurrence_types_forward_to_informed_email_check";
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT IF EXISTS "company_occurrence_types_forward_email_subject_check";
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT IF EXISTS "company_occurrence_types_forward_email_body_check";
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT IF EXISTS "company_occurrence_types_contractor_reply_requires_mail_check";
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT IF EXISTS "company_occurrence_types_contractor_reply_alert_wait_check";
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT IF EXISTS "company_occurrence_types_forward_automatic_needs_reply_check";
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT IF EXISTS "company_occurrence_types_forward_needs_text_check";

ALTER TABLE "company_occurrence_type_contractor_overrides" DROP COLUMN IF EXISTS "contractor_reply_mode";
ALTER TABLE "company_occurrence_type_contractor_overrides" DROP COLUMN IF EXISTS "contractor_reply_wait_hours";
ALTER TABLE "company_occurrence_type_contractor_overrides" DROP COLUMN IF EXISTS "forward_to_note_recipient";
ALTER TABLE "company_occurrence_types" DROP COLUMN IF EXISTS "contractor_reply_alert_interval_minutes";
ALTER TABLE "company_occurrence_types" DROP COLUMN IF EXISTS "contractor_reply_alert_max_count";
ALTER TABLE "company_occurrence_types" DROP COLUMN IF EXISTS "contractor_reply_alert_mode";
ALTER TABLE "company_occurrence_types" DROP COLUMN IF EXISTS "contractor_reply_attachment_kind";
ALTER TABLE "company_occurrence_types" DROP COLUMN IF EXISTS "contractor_reply_mode";
ALTER TABLE "company_occurrence_types" DROP COLUMN IF EXISTS "contractor_reply_wait_hours";
ALTER TABLE "company_occurrence_types" DROP COLUMN IF EXISTS "driver_reply_channel";
ALTER TABLE "company_occurrence_types" DROP COLUMN IF EXISTS "driver_reply_template";
ALTER TABLE "company_occurrence_types" DROP COLUMN IF EXISTS "driver_reply_window_closed_action";
ALTER TABLE "company_occurrence_types" DROP COLUMN IF EXISTS "forward_email_body";
ALTER TABLE "company_occurrence_types" DROP COLUMN IF EXISTS "forward_email_subject";
ALTER TABLE "company_occurrence_types" DROP COLUMN IF EXISTS "forward_to_informed_email";
ALTER TABLE "company_occurrence_types" DROP COLUMN IF EXISTS "forward_to_note_recipient";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261009022945_occurrence_contractor_reply';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_contractor_reply journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
