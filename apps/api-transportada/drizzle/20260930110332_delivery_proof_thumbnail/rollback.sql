-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 220 (RF17): tira a miniatura do comprovante e o purpose dela. Falha se ainda houver
-- objeto `trip_delivery_proof_thumbnail` em `stored_objects` — apague-os (e do storage) antes.
BEGIN;

ALTER TABLE "trip_delivery_proofs"
  DROP CONSTRAINT IF EXISTS "trip_delivery_proofs_company_thumbnail_fk";

DROP INDEX IF EXISTS "trip_delivery_proofs_company_thumbnail_idx";

ALTER TABLE "trip_delivery_proofs"
  DROP COLUMN IF EXISTS "thumbnail_object_id";

ALTER TABLE "stored_objects" DROP CONSTRAINT IF EXISTS "stored_objects_purpose_check";
ALTER TABLE "stored_objects" ADD CONSTRAINT "stored_objects_purpose_check" CHECK ("purpose" in ('import_source', 'nfe_document', 'nfe_event', 'billing_document', 'cte_document', 'mdfe_document', 'nfse_document', 'aggregate_document', 'delivery_proof', 'aggregate_application_attachment', 'contractor_mail_raw', 'trip_occurrence_attachment', 'trip_occurrence_thumbnail', 'extra_charge_batch_statement', 'occurrence_conversation_attachment')) NOT VALID;
ALTER TABLE "stored_objects" VALIDATE CONSTRAINT "stored_objects_purpose_check";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260930110332_delivery_proof_thumbnail';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivery_proof_thumbnail journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
