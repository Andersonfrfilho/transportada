-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 150 T101: a tabela do pedido de correção de endereço e o tipo de conversa novo em
-- `contractor_mail_threads.subject_type`.
--
-- Seguro só enquanto não existir conversa com `subject_type = 'address_correction'` — depois da
-- primeira, apagar essa opção do CHECK quebraria linhas já gravadas. Rode este rollback só se
-- `select count(*) from contractor_mail_threads where subject_type = 'address_correction'` for zero.
BEGIN;

DROP TABLE IF EXISTS "address_correction_requests";

ALTER TABLE "contractor_mail_threads"
  DROP CONSTRAINT IF EXISTS "contractor_mail_threads_subject_type_check";

ALTER TABLE "contractor_mail_threads"
  ADD CONSTRAINT "contractor_mail_threads_subject_type_check"
  CHECK ("subject_type" in ('stop_occurrence', 'document_occurrence', 'delivery_charge', 'setup_test'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260915162953_address_correction_requests';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one address_correction_requests journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
