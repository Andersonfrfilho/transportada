-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a T1.2 da spec 239: tira os cinco índices parciais por empresa e a tabela
-- `company_location_retention_settings`. Os índices só por tempo (`<tabela>_located_<tempo>_idx`)
-- são de migrations anteriores e não são tocados.
--
-- ⚠️ ESTRATÉGIA: RECUSAR, NÃO APAGAR. Se alguma empresa já gravou a configuração, o script aborta
-- ANTES de tocar em qualquer coisa. Derrubar a tabela com linha apagaria em silêncio a decisão da
-- empresa sobre reter ou apagar dado pessoal (LGPD) — e o rastro de quem decidiu. Apagar essa
-- decisão é escolha de quem opera: confira `audit_logs` e, se for o caso, rode antes de repetir
--   DELETE FROM "company_location_retention_settings";
--
-- ⚠️ Ordem: reverta a API e o worker **antes** deste script. Com o código novo no ar e a tabela
-- fora, a tela de configuração e a varredura do expurgo passam a falhar com 42P01.
BEGIN;

-- `DROP INDEX` toma ACCESS EXCLUSIVE em cada tabela de evento até o COMMIT: aborta em vez de
-- enfileirar o tráfego do motorista atrás de uma transação longa.
SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  recorded integer;
BEGIN
  SELECT count(*) INTO recorded FROM "company_location_retention_settings";
  IF recorded > 0 THEN
    RAISE EXCEPTION 'Rollback recusado: company_location_retention_settings tem % linha(s). Apagar a configuração de empresa é decisão humana (ver cabeçalho).', recorded;
  END IF;
END
$$;

DROP INDEX IF EXISTS "trip_delivery_proofs_company_located_created_at_idx";
DROP INDEX IF EXISTS "trip_document_occurrences_company_located_created_at_idx";
DROP INDEX IF EXISTS "trip_status_events_company_located_recorded_at_idx";
DROP INDEX IF EXISTS "trip_stop_events_company_located_created_at_idx";
DROP INDEX IF EXISTS "trip_stop_occurrences_company_located_created_at_idx";

DROP TABLE "company_location_retention_settings";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261003190847_location_retention_settings';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one location_retention_settings journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
