-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 091 T008: remove os anexos do motorista e o purpose deles. Falha se ainda houver objeto
-- `fleet_driver_attachment` em `stored_objects` — apague-os (e do bucket) antes.
BEGIN;

SET LOCAL lock_timeout = '3s';

DROP TABLE "fleet_driver_attachments";

ALTER TABLE "stored_objects" DROP CONSTRAINT IF EXISTS "stored_objects_purpose_check";
ALTER TABLE "stored_objects" ADD CONSTRAINT "stored_objects_purpose_check" CHECK ("purpose" in ('import_source', 'nfe_document', 'nfe_event', 'billing_document', 'cte_document', 'mdfe_document', 'nfse_document', 'aggregate_document', 'delivery_proof', 'aggregate_application_attachment', 'contractor_mail_raw', 'trip_occurrence_attachment', 'trip_occurrence_thumbnail', 'extra_charge_batch_statement', 'occurrence_conversation_attachment', 'trip_delivery_proof_thumbnail'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261105035107_fleet_driver_attachments';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_driver_attachments journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
