-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- ⚠️ DESTRUTIVO depois do primeiro deploy — exige aprovação humana (ADR-0094 §9.5, ajuste 7). O
-- pre-deploy semeia os tipos `receiving` logo depois desta migration, e a ocorrência de recebimento não
-- tem como voltar a uma nota de viagem. Por isso o rollback ABORTA se existir qualquer ocorrência de
-- recebimento (ou nota da chegada marcada), e só então apaga os tipos `receiving` — que, sem ocorrência,
-- não são referenciados por nada. Ordem: a FK do motivo da devolução e as colunas da nota da chegada →
-- FK, CHECKs e unique da ocorrência → os CHECKs de etapa e de evento voltam à forma antiga → `SET NOT NULL`.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  receiving_occurrences integer;
  marked_documents integer;
BEGIN
  SELECT count(*) INTO receiving_occurrences
    FROM "trip_document_occurrences"
    WHERE "trip_document_id" IS NULL OR "stage" = 'receiving';
  IF receiving_occurrences > 0 THEN
    RAISE EXCEPTION 'Refusing rollback: % receiving occurrence(s) would lose their owner',
      receiving_occurrences;
  END IF;

  SELECT count(*) INTO marked_documents
    FROM "cargo_arrival_documents"
    WHERE "return_to_contractor" <> 'none';
  IF marked_documents > 0 THEN
    RAISE EXCEPTION 'Refusing rollback: % cargo arrival document(s) marked to return',
      marked_documents;
  END IF;
END
$$;

-- Sem ocorrência de recebimento não há evento dos quatro kinds novos (todos nascem dela); a trilha é
-- append-only, e o CHECK antigo abaixo reprova se algum tiver escapado.
ALTER TABLE "cargo_arrival_events"
  DROP CONSTRAINT IF EXISTS "cargo_arrival_events_kind_check";

ALTER TABLE "cargo_arrival_documents"
  DROP CONSTRAINT IF EXISTS "cargo_arrival_documents_return_occurrence_fk",
  DROP CONSTRAINT IF EXISTS "cargo_arrival_documents_return_occurrence_check",
  DROP CONSTRAINT IF EXISTS "cargo_arrival_documents_return_to_contractor_check";
ALTER TABLE "cargo_arrival_documents" DROP COLUMN IF EXISTS "return_occurrence_id";
ALTER TABLE "cargo_arrival_documents" DROP COLUMN IF EXISTS "return_to_contractor";

ALTER TABLE "trip_document_occurrences"
  DROP CONSTRAINT IF EXISTS "trip_document_occurrences_company_arrival_document_id_unique",
  DROP CONSTRAINT IF EXISTS "trip_document_occurrences_company_arrival_document_fk",
  DROP CONSTRAINT IF EXISTS "trip_document_occurrences_receiving_owner_check",
  DROP CONSTRAINT IF EXISTS "trip_document_occurrences_owner_check";
ALTER TABLE "trip_document_occurrences" DROP COLUMN IF EXISTS "cargo_arrival_document_id";
ALTER TABLE "cargo_arrival_documents"
  DROP CONSTRAINT IF EXISTS "cargo_arrival_documents_company_id_id_unique";

DELETE FROM "company_occurrence_types" WHERE "stage" = 'receiving';

ALTER TABLE "company_occurrence_types"
  DROP CONSTRAINT IF EXISTS "company_occurrence_types_stage_check",
  ADD CONSTRAINT "company_occurrence_types_stage_check" CHECK ("stage" in ('delivery', 'separation'));
ALTER TABLE "trip_document_occurrences"
  DROP CONSTRAINT IF EXISTS "trip_document_occurrences_stage_check",
  ADD CONSTRAINT "trip_document_occurrences_stage_check" CHECK ("stage" in ('delivery', 'separation'));
ALTER TABLE "cargo_arrival_events"
  ADD CONSTRAINT "cargo_arrival_events_kind_check" CHECK ("kind" in ('arrival_closed', 'arrival_registered', 'document_added', 'document_received', 'document_separated', 'route_assigned'));

ALTER TABLE "trip_document_occurrences" ALTER COLUMN "trip_document_id" SET NOT NULL;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261006180700_cargo_arrival_receiving_occurrence';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cargo_arrival_receiving_occurrence journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
