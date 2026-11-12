-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 287: volta a CHECK ao conjunto anterior. Falha de propósito se já existir fio do cliente (apague-os antes).
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "contractor_mail_threads" DROP CONSTRAINT "contractor_mail_threads_subject_type_check",
  ADD CONSTRAINT "contractor_mail_threads_subject_type_check" CHECK ("subject_type" in ('stop_occurrence', 'document_occurrence', 'delivery_charge', 'setup_test', 'address_correction'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261101040658_client_mail_thread';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one client_mail_thread journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
