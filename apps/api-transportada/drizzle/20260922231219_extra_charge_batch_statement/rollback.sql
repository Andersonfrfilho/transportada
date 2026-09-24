-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 164 T20: o propósito `extra_charge_batch_statement` em `stored_objects` e a coluna
-- `statement_object_id` (nulável, aditiva) de `extra_charge_batches` — o ponteiro para o
-- demonstrativo de ressarcimento, artefato imutável gerado no fechamento do lote.
--
-- Recusa (RAISE) em vez de perder prova: se algum lote já aponta para um demonstrativo, ou se algum
-- objeto guardado usa o propósito novo, o rollback para antes de apagar a coluna e antes de
-- reapertar o CHECK — derrubar o CHECK com linha viva deixaria o banco inconsistente.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "extra_charge_batches" WHERE "statement_object_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'extra_charge_batches has rows using statement_object_id, refusing rollback';
  END IF;

  IF EXISTS (SELECT 1 FROM "stored_objects" WHERE "purpose" = 'extra_charge_batch_statement') THEN
    RAISE EXCEPTION 'stored_objects has rows using extra_charge_batch_statement, refusing rollback';
  END IF;
END
$$;

ALTER TABLE "extra_charge_batches" DROP CONSTRAINT "extra_charge_batches_company_statement_object_fk";

DROP INDEX "extra_charge_batches_company_statement_object_idx";

ALTER TABLE "extra_charge_batches" DROP COLUMN "statement_object_id";

ALTER TABLE "stored_objects" DROP CONSTRAINT "stored_objects_purpose_check";

ALTER TABLE "stored_objects"
  ADD CONSTRAINT "stored_objects_purpose_check"
  CHECK ("purpose" in ('import_source', 'nfe_document', 'nfe_event', 'billing_document', 'cte_document', 'mdfe_document', 'nfse_document', 'aggregate_document', 'delivery_proof', 'aggregate_application_attachment', 'contractor_mail_raw', 'trip_occurrence_attachment', 'trip_occurrence_thumbnail'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260922231219_extra_charge_batch_statement'
      AND "hash" = '2aa939d83e9cf160aaafbb2ee3ef54703a90891e861b99d6dbd729580608b658';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one extra_charge_batch_statement migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
