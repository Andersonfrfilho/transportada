-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove o outbox de leitura do anexo do agregado (spec 070, ADR-0053).
--
-- ⚠️ Pedido de leitura ainda não publicado **se perde com a tabela**. O anexo continua no bucket e na
-- fila de revisão, mas sem `extracted_fields` — o operador abre o arquivo, como já abre o anexo cuja
-- leitura não reconheceu nada. Nenhum dado de candidatura se perde.
BEGIN;

DROP TABLE IF EXISTS "aggregate_attachment_outbox";

ALTER TABLE "aggregate_application_attachments"
  DROP CONSTRAINT IF EXISTS "aggregate_application_attachments_company_id_id_unique";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260901194200_aggregate_attachment_outbox';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one aggregate_attachment_outbox journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
