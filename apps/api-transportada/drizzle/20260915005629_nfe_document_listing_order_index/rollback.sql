-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove o índice da ordem da listagem de notas (atualização, emissão, id).
--
-- Só índice: nenhum dado se perde. Sem ele a listagem continua certa, mas volta a ordenar a empresa
-- inteira a cada página.
BEGIN;

DROP INDEX IF EXISTS "nfe_documents_company_updated_issued_id_idx";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260915005629_nfe_document_listing_order_index';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfe_document_listing_order_index journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
