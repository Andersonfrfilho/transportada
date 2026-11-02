-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 287: volta as CHECKs ao conjunto da 283. Falha de proposito se ja existir conversa `client_email` (apague-as antes).
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "occurrence_conversations" DROP CONSTRAINT "occurrence_conversations_participant_check",
  ADD CONSTRAINT "occurrence_conversations_participant_check" CHECK ("participant" in ('contractor', 'driver', 'client'));
ALTER TABLE "occurrence_conversations" DROP CONSTRAINT "occurrence_conversations_participant_shape_check",
  ADD CONSTRAINT "occurrence_conversations_participant_shape_check" CHECK (("participant" = 'contractor' and "contractor_id" is not null and "public_ref" is not null and "driver_user_id" is null and "client_tax_id" is null)
        or ("participant" = 'driver' and "driver_user_id" is not null and "contractor_id" is null and "public_ref" is null and "client_tax_id" is null)
        or ("participant" = 'client' and "client_tax_id" is not null and "occurrence_kind" = 'document' and "contractor_id" is null and "driver_user_id" is null and "public_ref" is null));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261101050220_client_email_conversation';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one client_email_conversation journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
