-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 281 T5: tira o alvo `client_boleto_whatsapp`, os motivos do WhatsApp e o id do provedor das entregas do retorno.
-- Recusa com entrega já gravada nesse alvo ou com algum desses motivos (a linha ficaria fora da CHECK antiga e a trilha
-- do envio por WhatsApp se perderia).
-- Confira antes: select count(*) from occurrence_contractor_reply_deliveries where target = 'client_boleto_whatsapp';
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  whatsapp_deliveries integer;
BEGIN
  SELECT count(*) FROM "occurrence_contractor_reply_deliveries"
    WHERE "target" = 'client_boleto_whatsapp'
       OR "reason" in ('whatsapp_number_not_found', 'whatsapp_disconnected', 'attachment_too_large_for_whatsapp')
    INTO whatsapp_deliveries;

  IF whatsapp_deliveries > 0 THEN
    RAISE EXCEPTION 'rollback recusado: % entrega(s) por WhatsApp seriam perdidas (spec 281)', whatsapp_deliveries;
  END IF;
END
$$;

ALTER TABLE "occurrence_contractor_reply_events" DROP CONSTRAINT "occurrence_contractor_reply_events_reason_check",
  ADD CONSTRAINT "occurrence_contractor_reply_events_reason_check"
  CHECK ("reason" in ('no_accepted_attachment', 'multiple_attachments', 'document_not_confirmed', 'driver_without_account', 'driver_unreachable', 'whatsapp_window_closed', 'note_without_recipient_email', 'attachment_too_large_for_email', 'send_failed', 'client_without_email', 'document_confirmed', 'document_without_text'));
ALTER TABLE "occurrence_contractor_reply_deliveries" DROP CONSTRAINT "occurrence_contractor_reply_deliveries_address_check",
  ADD CONSTRAINT "occurrence_contractor_reply_deliveries_address_check"
  CHECK ("address" is null or ("target" in ('note_recipient_email', 'informed_email', 'client_boleto_emails') and char_length("address") between 1 and 254));
ALTER TABLE "occurrence_contractor_reply_deliveries" DROP CONSTRAINT "occurrence_contractor_reply_deliveries_reason_check",
  ADD CONSTRAINT "occurrence_contractor_reply_deliveries_reason_check"
  CHECK ("reason" in ('driver_without_account', 'driver_unreachable', 'whatsapp_window_closed', 'note_without_recipient_email', 'attachment_too_large_for_email', 'send_failed', 'client_without_email'));
ALTER TABLE "occurrence_contractor_reply_deliveries" DROP CONSTRAINT "occurrence_contractor_reply_deliveries_target_check",
  ADD CONSTRAINT "occurrence_contractor_reply_deliveries_target_check"
  CHECK ("target" in ('driver_app_chat', 'driver_whatsapp', 'note_recipient_email', 'informed_email', 'contractor_acknowledgement', 'client_boleto_emails'));
ALTER TABLE "occurrence_contractor_reply_deliveries" DROP CONSTRAINT "occurrence_contractor_reply_deliveries_provider_message_check";
DROP INDEX "occurrence_contractor_reply_deliveries_provider_message_unique";
ALTER TABLE "occurrence_contractor_reply_deliveries" DROP COLUMN "provider_message_id";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261027190000_contractor_reply_whatsapp_delivery';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one contractor_reply_whatsapp_delivery journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
