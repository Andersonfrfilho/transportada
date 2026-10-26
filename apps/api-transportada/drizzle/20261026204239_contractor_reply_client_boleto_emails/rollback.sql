-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 279 T3: tira o alvo `client_boleto_emails` das entregas do retorno. Recusa com entrega já gravada nesse alvo
-- (a linha ficaria fora da CHECK antiga e a trilha do envio ao cliente se perderia).
-- Confira antes: select count(*) from occurrence_contractor_reply_deliveries where target = 'client_boleto_emails';
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  client_deliveries integer;
BEGIN
  SELECT count(*) FROM "occurrence_contractor_reply_deliveries"
    WHERE "target" = 'client_boleto_emails' INTO client_deliveries;

  IF client_deliveries > 0 THEN
    RAISE EXCEPTION 'rollback recusado: % entrega(s) ao cadastro do cliente seriam perdidas (spec 279)', client_deliveries;
  END IF;
END
$$;

ALTER TABLE "occurrence_contractor_reply_deliveries" DROP CONSTRAINT "occurrence_contractor_reply_deliveries_address_check",
  ADD CONSTRAINT "occurrence_contractor_reply_deliveries_address_check"
  CHECK ("address" is null or ("target" in ('note_recipient_email', 'informed_email') and char_length("address") between 1 and 254));
ALTER TABLE "occurrence_contractor_reply_deliveries" DROP CONSTRAINT "occurrence_contractor_reply_deliveries_target_check",
  ADD CONSTRAINT "occurrence_contractor_reply_deliveries_target_check"
  CHECK ("target" in ('driver_app_chat', 'driver_whatsapp', 'note_recipient_email', 'informed_email', 'contractor_acknowledgement'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261026204239_contractor_reply_client_boleto_emails';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one contractor_reply_client_boleto_emails journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
