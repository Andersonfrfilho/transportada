-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Devolve o CHECK de `purpose` sem `aggregate_application_attachment` (spec 066 T023).
--
-- E **quebra** se existir objeto com esse proposito: o CHECK antigo o recusaria, e o ALTER falharia
-- no meio com a tabela ja alterada. Melhor recusar antes, dizendo quantos sao.
BEGIN;

DO $$
DECLARE
  affected integer;
BEGIN
  SELECT count(*) INTO affected
    FROM "stored_objects"
    WHERE "purpose" = 'aggregate_application_attachment';
  IF affected > 0 THEN
    RAISE EXCEPTION 'Stored objects with purpose aggregate_application_attachment: %. Remove them before rolling back.', affected;
  END IF;
END
$$;

ALTER TABLE "stored_objects" DROP CONSTRAINT "stored_objects_purpose_check",
  ADD CONSTRAINT "stored_objects_purpose_check" CHECK ("purpose" in ('import_source', 'nfe_document', 'nfe_event', 'billing_document', 'cte_document', 'mdfe_document', 'nfse_document', 'aggregate_document', 'delivery_proof'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260827202356_aggregate_application_attachment_purpose'
      AND "hash" = 'a0e29ee91cc39265dca417b28c76d9c3d80d264476f36fe4fc1d7e73a7687c13';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one aggregate_application_attachment_purpose migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
