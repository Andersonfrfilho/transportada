-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 246 T1.2: `note_mode` e `signature_mode` do tipo e das duas exceções, com as seis
-- CHECKs de vocabulário, e `signature_object_id` das duas ocorrências, com as FKs. Ordem inversa da
-- migration: as FKs e a coluna da assinatura caem primeiro, depois as CHECKs, e só então as colunas
-- que elas leem.
--
-- NÃO toca a coluna de produtos do tipo nem as duas CHECKs dela: são da spec 241, que está em
-- produção — derrubá-las desfaria o que não é desta migration.
--
-- O que se perde: o `note_mode` gravado (a regra fixa da 179 só volta se o código antigo estiver
-- publicado), qualquer `signature_mode` escolhido no cadastro, e a referência `signature_object_id`
-- das ocorrências já gravadas — o objeto continua no bucket, órfão da ocorrência. Preço aceito de um
-- rollback, registrado no plan.md da 246.

BEGIN;

ALTER TABLE "trip_document_occurrences"
  DROP CONSTRAINT IF EXISTS "trip_document_occurrences_company_signature_object_fk";

ALTER TABLE "trip_stop_occurrences"
  DROP CONSTRAINT IF EXISTS "trip_stop_occurrences_company_signature_object_fk";

ALTER TABLE "trip_document_occurrences" DROP COLUMN IF EXISTS "signature_object_id";

ALTER TABLE "trip_stop_occurrences" DROP COLUMN IF EXISTS "signature_object_id";

ALTER TABLE "company_occurrence_types"
  DROP CONSTRAINT IF EXISTS "company_occurrence_types_note_mode_check",
  DROP CONSTRAINT IF EXISTS "company_occurrence_types_signature_mode_check";

ALTER TABLE "company_occurrence_type_contractor_overrides"
  DROP CONSTRAINT IF EXISTS "occurrence_type_contractor_overrides_note_mode_check",
  DROP CONSTRAINT IF EXISTS "occurrence_type_contractor_overrides_signature_mode_check";

ALTER TABLE "company_occurrence_type_recipient_overrides"
  DROP CONSTRAINT IF EXISTS "occurrence_type_recipient_overrides_note_mode_check",
  DROP CONSTRAINT IF EXISTS "occurrence_type_recipient_overrides_signature_mode_check";

ALTER TABLE "company_occurrence_type_recipient_overrides"
  DROP COLUMN IF EXISTS "note_mode",
  DROP COLUMN IF EXISTS "signature_mode";

ALTER TABLE "company_occurrence_type_contractor_overrides"
  DROP COLUMN IF EXISTS "note_mode",
  DROP COLUMN IF EXISTS "signature_mode";

ALTER TABLE "company_occurrence_types"
  DROP COLUMN IF EXISTS "note_mode",
  DROP COLUMN IF EXISTS "signature_mode";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261006205139_occurrence_type_requirement_modes';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_type_requirement_modes journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
