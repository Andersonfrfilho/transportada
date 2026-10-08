-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a T1.2 da spec 238: tira a FK, o índice e as colunas `source_rule_id` e `kind` de
-- `municipal_holidays` e apaga as tabelas `municipal_holiday_rules`, `state_holidays` e
-- `company_business_calendar_settings`.
--
-- ⚠️ As linhas materializadas FICAM em `municipal_holidays` como datas fixas comuns: o rollback não faz
-- DELETE nessa tabela, e o roteirizador continua respeitando-as (ele só lê `holiday_on`). O que se perde:
-- as regras "todo ano" (a próxima geração de datas deixa de existir), o rótulo de aniversário da cidade
-- (`kind`), o vínculo de cada data com a regra que a gerou, os feriados estaduais e a configuração de
-- sábado da empresa. Quem quiser guardar isso exporta as quatro tabelas ANTES.
--
-- ⚠️ Ordem: reverta a API e o worker **antes** deste script. Com o código novo no ar e as tabelas fora,
-- a tela de feriados e a leitura do calendário passam a falhar com 42P01.
BEGIN;

-- `DROP COLUMN` e `DROP CONSTRAINT` tomam ACCESS EXCLUSIVE em `municipal_holidays` até o COMMIT: aborta
-- em vez de enfileirar o roteirizador atrás de uma transação longa.
SET LOCAL lock_timeout = '3s';

ALTER TABLE "municipal_holidays" DROP CONSTRAINT "municipal_holidays_company_source_rule_fk";
DROP INDEX "municipal_holidays_company_source_rule_idx";
ALTER TABLE "municipal_holidays" DROP CONSTRAINT "municipal_holidays_kind_check";
ALTER TABLE "municipal_holidays" DROP COLUMN "source_rule_id";
ALTER TABLE "municipal_holidays" DROP COLUMN "kind";

DROP TABLE "state_holidays";
DROP TABLE "company_business_calendar_settings";
DROP TABLE "municipal_holiday_rules";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261007140303_business_calendar';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one business_calendar journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
