-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 286 T3: tira a trava `claimed_at` e os motivos `client_without_whatsapp`/`template_missing` das entregas do retorno.
-- Recusa com entrega ou evento gravado com algum desses motivos (a linha ficaria fora da CHECK antiga).
-- Confira antes: select count(*) from occurrence_contractor_reply_deliveries
--   where reason in ('client_without_whatsapp', 'template_missing');
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  rows_with_reason integer;
BEGIN
  SELECT (SELECT count(*) FROM "occurrence_contractor_reply_deliveries"
           WHERE "reason" in ('client_without_whatsapp', 'template_missing'))
       + (SELECT count(*) FROM "occurrence_contractor_reply_events"
           WHERE "reason" in ('client_without_whatsapp', 'template_missing'))
    INTO rows_with_reason;

  IF rows_with_reason > 0 THEN
    RAISE EXCEPTION 'rollback recusado: % linha(s) com motivo da spec 286 seriam perdidas', rows_with_reason;
  END IF;
END
$$;

ALTER TABLE "occurrence_contractor_reply_events" DROP CONSTRAINT "occurrence_contractor_reply_events_reason_check",
  ADD CONSTRAINT "occurrence_contractor_reply_events_reason_check"
  CHECK ("reason" in ('no_accepted_attachment', 'multiple_attachments', 'document_not_confirmed', 'driver_without_account', 'driver_unreachable', 'whatsapp_window_closed', 'note_without_recipient_email', 'attachment_too_large_for_email', 'send_failed', 'client_without_email', 'whatsapp_number_not_found', 'whatsapp_disconnected', 'attachment_too_large_for_whatsapp', 'document_confirmed', 'document_without_text'));
ALTER TABLE "occurrence_contractor_reply_deliveries" DROP CONSTRAINT "occurrence_contractor_reply_deliveries_reason_check",
  ADD CONSTRAINT "occurrence_contractor_reply_deliveries_reason_check"
  CHECK ("reason" in ('driver_without_account', 'driver_unreachable', 'whatsapp_window_closed', 'note_without_recipient_email', 'attachment_too_large_for_email', 'send_failed', 'client_without_email', 'whatsapp_number_not_found', 'whatsapp_disconnected', 'attachment_too_large_for_whatsapp'));
ALTER TABLE "occurrence_contractor_reply_deliveries" DROP COLUMN "claimed_at";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261029005751_client_whatsapp_automatic';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one client_whatsapp_automatic journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
