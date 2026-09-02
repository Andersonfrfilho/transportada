-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Volta o CHECK ao conjunto de quatro tipos (spec 071).
--
-- ⚠️ Se já houver linha `address_proof` ou `company_document` gravada, o `ADD CONSTRAINT` falha e a
-- transação inteira volta atrás — de propósito. Apagar anexo de candidatura para caber num CHECK
-- antigo destruiria o documento que o operador ainda precisa conferir; reclassifique as linhas à mão
-- antes de reverter.
BEGIN;

ALTER TABLE "aggregate_application_attachments"
  DROP CONSTRAINT IF EXISTS "aggregate_application_attachments_type_check";

ALTER TABLE "aggregate_application_attachments"
  ADD CONSTRAINT "aggregate_application_attachments_type_check"
  CHECK ("type" in ('ccmei', 'cnh', 'crlv', 'other'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260901230000_aggregate_attachment_document_types';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one aggregate_attachment_document_types journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
