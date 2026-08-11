-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Devolve a unicidade total de (company_id, cte_document_id) e apaga a marca de cancelamento.
-- Falha de propósito se algum CT-e já tiver sido refaturado depois do cancelamento: a linha nova e
-- a antiga não cabem na mesma unicidade, e apagar uma delas seria perder fatura emitida.
BEGIN;

DROP INDEX IF EXISTS "billing_invoice_items_active_cte_document_unique";

ALTER TABLE "billing_invoice_items"
  ADD CONSTRAINT "billing_invoice_items_company_cte_document_unique"
  UNIQUE ("company_id", "cte_document_id");

ALTER TABLE "billing_invoice_items" DROP COLUMN IF EXISTS "cancelled_at";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260811180555_billing_invoice_item_release'
      AND "hash" = 'c689f9fe69426036e79b2a4f11d93ecaec8d6935af5fb0095b6547283d71bba7';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one billing_invoice_item_release migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
