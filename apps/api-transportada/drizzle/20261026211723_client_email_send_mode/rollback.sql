-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 279 T3c: tira o modo de envio ao cliente do tipo de ocorrencia e o motivo `client_without_email` das entregas e
-- do historico do retorno. Recusa com linha gravada com esse motivo (ficaria fora da CHECK antiga).
-- Confira antes: select count(*) from occurrence_contractor_reply_deliveries where reason = 'client_without_email';
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  client_without_email integer;
BEGIN
  SELECT (SELECT count(*) FROM "occurrence_contractor_reply_deliveries" WHERE "reason" = 'client_without_email')
       + (SELECT count(*) FROM "occurrence_contractor_reply_events" WHERE "reason" = 'client_without_email')
    INTO client_without_email;

  IF client_without_email > 0 THEN
    RAISE EXCEPTION 'rollback recusado: % linha(s) com o motivo client_without_email seriam perdidas (spec 279)', client_without_email;
  END IF;
END
$$;

ALTER TABLE "occurrence_contractor_reply_events" DROP CONSTRAINT "occurrence_contractor_reply_events_reason_check",
  ADD CONSTRAINT "occurrence_contractor_reply_events_reason_check"
  CHECK ("reason" in ('no_accepted_attachment', 'multiple_attachments', 'document_not_confirmed', 'driver_without_account', 'driver_unreachable', 'whatsapp_window_closed', 'note_without_recipient_email', 'attachment_too_large_for_email', 'send_failed', 'document_confirmed', 'document_without_text'));
ALTER TABLE "occurrence_contractor_reply_deliveries" DROP CONSTRAINT "occurrence_contractor_reply_deliveries_reason_check",
  ADD CONSTRAINT "occurrence_contractor_reply_deliveries_reason_check"
  CHECK ("reason" in ('driver_without_account', 'driver_unreachable', 'whatsapp_window_closed', 'note_without_recipient_email', 'attachment_too_large_for_email', 'send_failed'));
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT "company_occurrence_types_client_email_send_mode_check";
ALTER TABLE "company_occurrence_types" DROP COLUMN "client_email_send_mode";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261026211723_client_email_send_mode';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one client_email_send_mode journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
