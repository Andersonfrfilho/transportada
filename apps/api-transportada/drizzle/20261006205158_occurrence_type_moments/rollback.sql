-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 246 T1b.1: a tabela `company_occurrence_type_moments` (com as FKs, a unicidade e a
-- CHECK dela) e o registro do journal. `stage` e `flow` do tipo NÃO são tocados: continuaram
-- gravados, derivados do conjunto, justamente para serem a rede deste rollback.
--
-- O que se perde: o conjunto de momentos de todo tipo que tinha MAIS momentos do que o par
-- `stage`/`flow` consegue dizer — um tipo `separation + document` volta a ser só de galpão
-- (`stage = 'separation'`), e o motorista deixa de vê-lo. Preço aceito de um rollback, registrado no
-- plan.md da 246. O código anterior não lê a tabela; nenhum outro dado depende dela.

BEGIN;

DROP TABLE IF EXISTS "company_occurrence_type_moments";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261006205158_occurrence_type_moments';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_type_moments journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
