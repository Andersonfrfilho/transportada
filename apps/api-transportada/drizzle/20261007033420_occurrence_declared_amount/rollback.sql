-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 247 T2.2: os seis campos do tipo, os dois modos das duas exceções, o número e o valor
-- pago da ocorrência, a cópia do valor unitário e o valor pago dos produtos, com as CHECKs que os leem.
-- Ordem inversa da migration: as CHECKs caem primeiro, depois as colunas. Sem CASCADE.
--
-- NÃO toca `items_mode`, `note_mode`, `signature_mode`, os mínimos nem as CHECKs da spec 241/246 nas
-- mesmas tabelas — estão em produção.
--
-- O que se perde: os números do documento do cliente e os valores pagos digitados nas ocorrências, o
-- valor unitário copiado da nota em cada produto registrado, e a configuração de número/valor pago,
-- rótulos e linha de item de e-mail de cada tipo e exceção. Preço aceito de um rollback, só antes da
-- etapa 3 da ADR-0081 §9 (plan.md da 247).

BEGIN;

ALTER TABLE "trip_document_occurrences"
  DROP CONSTRAINT IF EXISTS "trip_document_occurrences_declared_amount_check",
  DROP CONSTRAINT IF EXISTS "trip_document_occurrences_reference_number_check";

ALTER TABLE "trip_document_occurrence_products"
  DROP CONSTRAINT IF EXISTS "trip_document_occurrence_products_declared_amount_check",
  DROP CONSTRAINT IF EXISTS "trip_document_occurrence_products_unit_value_check";

ALTER TABLE "company_occurrence_types"
  DROP CONSTRAINT IF EXISTS "company_occurrence_types_declared_amount_items_check",
  DROP CONSTRAINT IF EXISTS "company_occurrence_types_email_item_line_template_check",
  DROP CONSTRAINT IF EXISTS "company_occurrence_types_declared_amount_label_check",
  DROP CONSTRAINT IF EXISTS "company_occurrence_types_declared_amount_scope_check",
  DROP CONSTRAINT IF EXISTS "company_occurrence_types_declared_amount_mode_check",
  DROP CONSTRAINT IF EXISTS "company_occurrence_types_reference_number_label_check",
  DROP CONSTRAINT IF EXISTS "company_occurrence_types_reference_number_mode_check";

ALTER TABLE "company_occurrence_type_recipient_overrides"
  DROP CONSTRAINT IF EXISTS "occurrence_type_recipient_overrides_declared_amount_mode_check",
  DROP CONSTRAINT IF EXISTS "occurrence_type_recipient_overrides_reference_mode_check";

ALTER TABLE "company_occurrence_type_contractor_overrides"
  DROP CONSTRAINT IF EXISTS "occurrence_type_contractor_overrides_declared_amount_mode_check",
  DROP CONSTRAINT IF EXISTS "occurrence_type_contractor_overrides_reference_mode_check";

ALTER TABLE "trip_document_occurrences"
  DROP COLUMN IF EXISTS "declared_amount",
  DROP COLUMN IF EXISTS "reference_number";

ALTER TABLE "trip_document_occurrence_products"
  DROP COLUMN IF EXISTS "declared_amount",
  DROP COLUMN IF EXISTS "unit_value";

ALTER TABLE "company_occurrence_types"
  DROP COLUMN IF EXISTS "email_item_line_template",
  DROP COLUMN IF EXISTS "declared_amount_label",
  DROP COLUMN IF EXISTS "declared_amount_scope",
  DROP COLUMN IF EXISTS "declared_amount_mode",
  DROP COLUMN IF EXISTS "reference_number_label",
  DROP COLUMN IF EXISTS "reference_number_mode";

ALTER TABLE "company_occurrence_type_recipient_overrides"
  DROP COLUMN IF EXISTS "declared_amount_mode",
  DROP COLUMN IF EXISTS "reference_number_mode";

ALTER TABLE "company_occurrence_type_contractor_overrides"
  DROP COLUMN IF EXISTS "declared_amount_mode",
  DROP COLUMN IF EXISTS "reference_number_mode";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261007033420_occurrence_declared_amount';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_declared_amount journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
