-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 183 T702a (RF10): os pedidos de upload do anexo da conversa e o propósito
-- `occurrence_conversation_attachment` em `stored_objects`. ⚠️ O CHECK antigo só volta se nenhum
-- objeto usar o propósito novo — com anexo gravado, o rollback falha em vez de apagar prova; tire os
-- anexos (e os objetos do bucket) antes, por decisão explícita.

BEGIN;

DROP TABLE IF EXISTS "occurrence_conversation_uploads";

ALTER TABLE "stored_objects" DROP CONSTRAINT "stored_objects_purpose_check", ADD CONSTRAINT "stored_objects_purpose_check" CHECK ("purpose" in ('import_source', 'nfe_document', 'nfe_event', 'billing_document', 'cte_document', 'mdfe_document', 'nfse_document', 'aggregate_document', 'delivery_proof', 'aggregate_application_attachment', 'contractor_mail_raw', 'trip_occurrence_attachment', 'trip_occurrence_thumbnail', 'extra_charge_batch_statement'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260925111600_occurrence_conversation_uploads';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_conversation_uploads migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
