-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 164 T1: as tabelas `trip_occurrence_cases` e `trip_occurrence_case_events` (a
-- tratativa da nota atingida por ocorrência e o histórico append-only dela), e a coluna
-- `redelivery_policy` de `company_occurrence_types`. O item do acerto
-- (`trip_occurrence_item_settlements`) não existe ainda — foi movido para a T16.
--
-- O que se perde: qualquer tratativa aberta e o histórico dela. A coluna `redelivery_policy`
-- some, e com ela a escolha de quais tipos de ocorrência abrem reentrega/pagamento.
--
-- Recusa (RAISE) em vez de apagar dado de verdade: linha em qualquer uma das duas tabelas novas
-- faz o rollback parar antes de qualquer DDL.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "trip_occurrence_cases") THEN
    RAISE EXCEPTION 'trip_occurrence_cases has rows, refusing rollback';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "trip_occurrence_case_events") THEN
    RAISE EXCEPTION 'trip_occurrence_case_events has rows, refusing rollback';
  END IF;
END
$$;

DROP TABLE "trip_occurrence_case_events";

DROP TABLE "trip_occurrence_cases";

ALTER TABLE "company_occurrence_types" DROP CONSTRAINT "company_occurrence_types_redelivery_policy_check";

ALTER TABLE "company_occurrence_types" DROP COLUMN "redelivery_policy";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260922174226_trip_occurrence_cases'
      AND "hash" = 'e231492ba004cc2dadc1fd59367974a371d2bca4b87a08a397b673ec0fad8b65';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_occurrence_cases migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
