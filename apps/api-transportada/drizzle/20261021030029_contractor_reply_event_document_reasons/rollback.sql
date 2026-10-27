-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 278: recria a CHECK do motivo do evento sem `document_confirmed` e sem `document_without_text`. Recusa se
-- algum evento já gravou um deles: o histórico é append-only e não se reescreve.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "occurrence_contractor_reply_events"
      WHERE "reason" IN ('document_confirmed', 'document_without_text')
  ) THEN
    RAISE EXCEPTION 'rollback recusado: existem eventos do retorno com o resultado da conferência do boleto (spec 278)';
  END IF;
END
$$;

ALTER TABLE "occurrence_contractor_reply_events" DROP CONSTRAINT "occurrence_contractor_reply_events_reason_check", ADD CONSTRAINT "occurrence_contractor_reply_events_reason_check" CHECK ("reason" in ('no_accepted_attachment', 'multiple_attachments', 'document_not_confirmed', 'driver_without_account', 'driver_unreachable', 'whatsapp_window_closed', 'note_without_recipient_email', 'attachment_too_large_for_email', 'send_failed'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261021030029_contractor_reply_event_document_reasons';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one contractor_reply_event_document_reasons journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
