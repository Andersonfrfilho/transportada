-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a trava de uma sugestao por nota e tipo (spec 060 T010).
--
-- Reverter e barato e reversivel: o indice e parcial e nao guarda dado. O que volta a ser possivel
-- e a regra recorrente e a ocorrencia do motorista proporem a mesma taxa duas vezes, e o operador
-- conferir duas linhas que sao a mesma cobranca.
BEGIN;

DROP INDEX IF EXISTS "delivery_charges_suggested_unique";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260827103032_delivery_charge_suggestion_unique'
      AND "hash" = 'c6cd31b2fc92173a0ffb18ef0953a8a79e5310927c70a1b788ec033227a60d3a';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivery_charge_suggestion_unique migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
