-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 276 T2: recria as CHECKs sem `boleto_pdf` e sem `document_not_confirmed`. Recusa se algum tipo
-- já usa o boleto conferido ou algum retorno já foi parar no operador por isso: não reescreve dado.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "company_occurrence_types"
      WHERE "contractor_reply_attachment_kind" = 'boleto_pdf'
  ) THEN
    RAISE EXCEPTION 'rollback recusado: existem tipos de ocorrência com anexo boleto_pdf (spec 276)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "occurrence_contractor_replies" WHERE "reason" = 'document_not_confirmed'
  ) OR EXISTS (
    SELECT 1 FROM "occurrence_contractor_reply_events" WHERE "reason" = 'document_not_confirmed'
  ) THEN
    RAISE EXCEPTION 'rollback recusado: existem retornos com motivo document_not_confirmed (spec 276)';
  END IF;
END
$$;

ALTER TABLE "company_occurrence_types" DROP CONSTRAINT "company_occurrence_types_contractor_reply_attachment_kind_check", ADD CONSTRAINT "company_occurrence_types_contractor_reply_attachment_kind_check" CHECK ("contractor_reply_attachment_kind" in ('pdf', 'pdf_or_image'));
ALTER TABLE "occurrence_contractor_replies" DROP CONSTRAINT "occurrence_contractor_replies_reason_check", ADD CONSTRAINT "occurrence_contractor_replies_reason_check" CHECK ("reason" is null or ("status" = 'needs_operator' and "reason" in ('no_accepted_attachment', 'multiple_attachments')));
ALTER TABLE "occurrence_contractor_reply_events" DROP CONSTRAINT "occurrence_contractor_reply_events_reason_check", ADD CONSTRAINT "occurrence_contractor_reply_events_reason_check" CHECK ("reason" in ('no_accepted_attachment', 'multiple_attachments', 'driver_without_account', 'driver_unreachable', 'whatsapp_window_closed', 'note_without_recipient_email', 'attachment_too_large_for_email', 'send_failed'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261020171448_contractor_reply_boleto_check';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one contractor_reply_boleto_check journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
