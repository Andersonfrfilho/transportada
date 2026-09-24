-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 164 T1/T2: as tabelas `trip_occurrence_cases` e `trip_occurrence_case_events` (a
-- tratativa da nota atingida por ocorrência e o histórico append-only dela, já com o estado
-- `cancelled` e a coluna `redelivery_application` da T2), e a coluna `redelivery_policy` de
-- `company_occurrence_types`. O item do acerto (`trip_occurrence_item_settlements`) não existe
-- ainda — foi movido para a T16.
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
      AND "hash" = 'f4d80dd16189575d22d2d12c1b1c25bd2df15bbb00ee3ddb25a7b3ea0ba04b6e';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_occurrence_cases migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
