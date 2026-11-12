-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 286 (RF4): tira a marca da queda do WhatsApp das entregas do retorno. Perde só a marca (o e-mail segue gravado).
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "occurrence_contractor_reply_deliveries"
  DROP CONSTRAINT "occurrence_contractor_reply_deliveries_fallback_from_check";
ALTER TABLE "occurrence_contractor_reply_deliveries" DROP COLUMN "fallback_from";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261029023933_client_email_fallback_from';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one client_email_fallback_from journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
