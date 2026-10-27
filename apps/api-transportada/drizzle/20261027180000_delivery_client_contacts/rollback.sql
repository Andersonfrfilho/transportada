-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 281 T3b: volta a `delivery_client_emails` da 279 (tira a visao de compatibilidade, o canal e a ocorrencia de
-- origem) e tira o `client_channel` do tipo de ocorrencia. Recusa com contato de WhatsApp guardado: a tabela antiga so
-- guarda e-mail e o numero do cliente nao se reconstroi. Exporte antes.
-- Confira antes: select count(*) from delivery_client_contacts where channel <> 'email';
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  other_channels integer;
BEGIN
  SELECT count(*) FROM "delivery_client_contacts" WHERE "channel" <> 'email' INTO other_channels;

  IF other_channels > 0 THEN
    RAISE EXCEPTION 'rollback recusado: % contato(s) de WhatsApp do cliente seriam perdidos (spec 281)', other_channels;
  END IF;
END
$$;

ALTER TABLE "company_occurrence_types" DROP CONSTRAINT "company_occurrence_types_client_channel_check";
ALTER TABLE "company_occurrence_types" DROP COLUMN "client_channel";

DROP VIEW "delivery_client_emails";

ALTER TABLE "delivery_client_contacts" DROP CONSTRAINT "delivery_client_contacts_address_check";
ALTER TABLE "delivery_client_contacts" DROP CONSTRAINT "delivery_client_contacts_channel_check";
ALTER TABLE "delivery_client_contacts" DROP COLUMN "source_occurrence_id";
ALTER TABLE "delivery_client_contacts" DROP COLUMN "channel";
ALTER TABLE "delivery_client_contacts" ADD CONSTRAINT "delivery_client_emails_address_check"
  CHECK (length("address") <= 254 and "address" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
ALTER INDEX "delivery_client_contacts_client_purpose_idx" RENAME TO "delivery_client_emails_client_purpose_idx";
ALTER INDEX "delivery_client_contacts_client_purpose_address_unique" RENAME TO "delivery_client_emails_client_purpose_address_unique";
ALTER TABLE "delivery_client_contacts" RENAME CONSTRAINT "delivery_client_contacts_created_by_kind_check" TO "delivery_client_emails_created_by_kind_check";
ALTER TABLE "delivery_client_contacts" RENAME CONSTRAINT "delivery_client_contacts_label_check" TO "delivery_client_emails_label_check";
ALTER TABLE "delivery_client_contacts" RENAME CONSTRAINT "delivery_client_contacts_purpose_check" TO "delivery_client_emails_purpose_check";
ALTER TABLE "delivery_client_contacts" RENAME CONSTRAINT "delivery_client_contacts_client_fk" TO "delivery_client_emails_client_fk";
ALTER TABLE "delivery_client_contacts" RENAME CONSTRAINT "delivery_client_contacts_pkey" TO "delivery_client_emails_pkey";
ALTER TABLE "delivery_client_contacts" RENAME TO "delivery_client_emails";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261027180000_delivery_client_contacts';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivery_client_contacts journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
