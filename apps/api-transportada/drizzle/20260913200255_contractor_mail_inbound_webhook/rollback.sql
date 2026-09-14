-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 143 T010: o único de idempotência do webhook de entrada e o valor novo do CHECK de
-- `stored_objects.purpose`. Aditiva e segura a qualquer momento — nenhuma linha de
-- `contractor_inbound_email_outbox` nem `stored_objects` com `purpose = 'contractor_mail_raw'`
-- existe em produção ainda (a feature não foi lançada).
BEGIN;

ALTER TABLE "stored_objects"
  DROP CONSTRAINT IF EXISTS "stored_objects_purpose_check";

ALTER TABLE "stored_objects"
  ADD CONSTRAINT "stored_objects_purpose_check"
  CHECK ("purpose" in ('import_source', 'nfe_document', 'nfe_event', 'billing_document',
    'cte_document', 'mdfe_document', 'nfse_document', 'aggregate_document', 'delivery_proof',
    'aggregate_application_attachment'));

ALTER TABLE "contractor_inbound_email_outbox"
  DROP CONSTRAINT IF EXISTS "contractor_inbound_email_outbox_company_provider_email_unique";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260913200255_contractor_mail_inbound_webhook';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one contractor_mail_inbound_webhook journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
