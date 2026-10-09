-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 262: apaga `holiday_provider_settings` (a chave selada da FeriadosAPI e o orçamento mensal).
--
-- Não recusa: a tabela não guarda dado de negócio, e a chave se reemite no fornecedor. Reverter o worker da
-- 262 ANTES (ele lê esta tabela a cada ciclo; sem ela a etapa de busca falha e o ciclo fecha
-- `unexpected_error`, sem derrubar o resto). Depois do rollback o painel volta a não ter onde guardar a chave.
BEGIN;

SET LOCAL lock_timeout = '3s';

DROP TABLE "holiday_provider_settings";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261009223052_holiday_provider_settings';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one holiday_provider_settings journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
