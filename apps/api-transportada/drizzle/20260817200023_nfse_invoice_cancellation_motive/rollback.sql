-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove o código do motivo de cancelamento e a restrição de conjunto.
-- Perde dado: o código gravado nas notas canceladas depois da migration não volta. O texto livre do
-- operador continua em `cancellation_reason`, que esta migration não tocou — é ele que responde
-- "por que a nota saiu do ar" enquanto a coluna não existir.
BEGIN;

ALTER TABLE "nfse_service_invoices" DROP CONSTRAINT "nfse_service_invoices_cancellation_motive_check";

ALTER TABLE "nfse_service_invoices" DROP COLUMN "cancellation_motive";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260817200023_nfse_invoice_cancellation_motive'
      AND "hash" = 'aa9e2c77c14e1d54d9f47ba2c9275bf6f438dd197c26377ef1d9880af09f52d4';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfse_invoice_cancellation_motive migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
