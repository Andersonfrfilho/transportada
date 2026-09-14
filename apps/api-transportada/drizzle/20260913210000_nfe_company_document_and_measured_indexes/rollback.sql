-- D11: índices de leitura para o volume e o produto por (empresa, documento), e o índice parcial
-- da caixa medida por empresa. Derrubar não perde dado nenhum: índice é derivado da tabela.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260913210000_nfe_company_document_and_measured_indexes';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfe_company_document_and_measured_indexes journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

DROP INDEX IF EXISTS "nfe_volumes_company_document_idx";
DROP INDEX IF EXISTS "nfe_products_company_document_idx";
DROP INDEX IF EXISTS "nfe_package_boxes_company_measured_idx";
