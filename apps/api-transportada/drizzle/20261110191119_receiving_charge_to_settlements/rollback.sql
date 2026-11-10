-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 317 Etapa 1: desfaz a cobrança no recebimento (enum, vínculo da cobrança com a ocorrência de parada,
-- notas da linha agrupada, vagas e fotos por vaga, valor pago / PIX, comprovante do PIX e marca do cliente).
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar com dado gravado: apagar as colunas perderia dinheiro cobrado,
-- fotos e o PIX do motorista. A semeadura do tipo `unexpected_charge` volta ao padrão do que a migration alterou
-- (nome, valor pago desligado, escopo `item`); o e-mail à contratante continua desligado, de propósito.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  receiving_charges integer;
  recorded_occurrences integer;
  stored_photos integer;
  flagged_clients integer;
BEGIN
  SELECT count(*) INTO receiving_charges FROM "delivery_charges"
    WHERE "charge_type" = 'receiving_charge' OR "stop_occurrence_id" IS NOT NULL OR "grouped_documents";
  IF receiving_charges > 0 THEN
    RAISE EXCEPTION 'delivery_charges has % receiving charge rows; refusing to roll back spec 317', receiving_charges;
  END IF;

  SELECT count(*) INTO recorded_occurrences FROM "trip_stop_occurrences"
    WHERE "declared_amount" IS NOT NULL OR "paid_by" IS NOT NULL OR "driver_pix_key" IS NOT NULL
       OR "driver_payout_receipt_object_id" IS NOT NULL;
  IF recorded_occurrences > 0 THEN
    RAISE EXCEPTION 'trip_stop_occurrences has % rows with spec 317 data; refusing to roll back', recorded_occurrences;
  END IF;

  SELECT count(*) INTO stored_photos FROM "trip_stop_occurrence_photos";
  IF stored_photos > 0 THEN
    RAISE EXCEPTION 'trip_stop_occurrence_photos has % rows; refusing to roll back spec 317', stored_photos;
  END IF;

  SELECT count(*) INTO flagged_clients FROM "delivery_clients"
    WHERE "receiving_charge_flagged_at" IS NOT NULL;
  IF flagged_clients > 0 THEN
    RAISE EXCEPTION 'delivery_clients has % flagged rows; refusing to roll back spec 317', flagged_clients;
  END IF;
END
$$;

-- A regra recorrente nunca gravou o tipo novo (a validação o recusa), mas a CHECK volta ao vocabulário antigo.
ALTER TABLE "delivery_client_charge_rules" DROP CONSTRAINT "delivery_client_charge_rules_type_check", ADD CONSTRAINT "delivery_client_charge_rules_type_check" CHECK ("charge_type" in ('unloading', 'scheduling', 'platform', 'parking', 'other', 'returned_goods'));
ALTER TABLE "delivery_charges" DROP CONSTRAINT "delivery_charges_amount_check", ADD CONSTRAINT "delivery_charges_amount_check" CHECK ("amount" > 0 or "status" = 'suggested');
ALTER TABLE "delivery_charges" DROP CONSTRAINT "delivery_charges_type_check", ADD CONSTRAINT "delivery_charges_type_check" CHECK ("charge_type" in ('unloading', 'scheduling', 'platform', 'parking', 'other', 'returned_goods'));

DROP TABLE "trip_stop_occurrence_photos";
DROP TABLE "delivery_charge_documents";
DROP TABLE "company_occurrence_type_photo_slots";

ALTER TABLE "delivery_charges" DROP CONSTRAINT "delivery_charges_grouped_documents_check";
ALTER TABLE "delivery_charges" DROP CONSTRAINT "delivery_charges_stop_occurrence_type_check";
ALTER TABLE "delivery_charges" DROP CONSTRAINT "delivery_charges_receiving_charge_check";
DROP INDEX "delivery_charges_stop_occurrence_grouped_unique";
DROP INDEX "delivery_charges_stop_occurrence_document_unique";
ALTER TABLE "delivery_charges" DROP CONSTRAINT "delivery_charges_company_proof_object_fk";
ALTER TABLE "delivery_charges" DROP CONSTRAINT "delivery_charges_company_stop_occurrence_fk";
ALTER TABLE "delivery_charges" DROP COLUMN "grouped_documents";
ALTER TABLE "delivery_charges" DROP COLUMN "stop_occurrence_id";

ALTER TABLE "delivery_clients" DROP CONSTRAINT "delivery_clients_receiving_charge_mark_check";
ALTER TABLE "delivery_clients" DROP CONSTRAINT "delivery_clients_receiving_charge_source_fk";
ALTER TABLE "delivery_clients" DROP COLUMN "receiving_charge_source_stop_occurrence_id";
ALTER TABLE "delivery_clients" DROP COLUMN "receiving_charge_flagged_at";

ALTER TABLE "trip_stop_occurrences" DROP CONSTRAINT "trip_stop_occurrences_driver_payout_check";
ALTER TABLE "trip_stop_occurrences" DROP CONSTRAINT "trip_stop_occurrences_driver_pix_check";
ALTER TABLE "trip_stop_occurrences" DROP CONSTRAINT "trip_stop_occurrences_paid_by_check";
ALTER TABLE "trip_stop_occurrences" DROP CONSTRAINT "trip_stop_occurrences_declared_amount_check";
ALTER TABLE "trip_stop_occurrences" DROP CONSTRAINT "trip_stop_occurrences_payout_sender_membership_fk";
ALTER TABLE "trip_stop_occurrences" DROP CONSTRAINT "trip_stop_occurrences_company_payout_receipt_object_fk";
ALTER TABLE "trip_stop_occurrences" DROP COLUMN "driver_payout_sent_by_user_id";
ALTER TABLE "trip_stop_occurrences" DROP COLUMN "driver_payout_sent_at";
ALTER TABLE "trip_stop_occurrences" DROP COLUMN "driver_payout_receipt_object_id";
ALTER TABLE "trip_stop_occurrences" DROP COLUMN "driver_pix_key_type";
ALTER TABLE "trip_stop_occurrences" DROP COLUMN "driver_pix_key";
ALTER TABLE "trip_stop_occurrences" DROP COLUMN "paid_by";
ALTER TABLE "trip_stop_occurrences" DROP COLUMN "declared_amount";

ALTER TABLE "company_occurrence_types" DROP COLUMN "show_client_charge_seal_to_driver";

UPDATE "company_occurrence_types"
SET "name" = 'Cobrança inesperada'
WHERE "flow" = 'stop' AND "stop_kind" = 'unexpected_charge' AND "name" = 'Cobrança no recebimento';
UPDATE "company_occurrence_types"
SET "declared_amount_mode" = 'off', "declared_amount_scope" = 'item'
WHERE "flow" = 'stop' AND "stop_kind" = 'unexpected_charge';

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261110191119_receiving_charge_to_settlements';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one receiving_charge_to_settlements journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
