-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 183 T406 (RF16): o nome do cabeçalho `From` do e-mail recebido. O que se perde é só
-- o nome gravado; o endereço (`from_address`) e o MIME bruto ficam, e o nome pode ser relido dele.

BEGIN;

ALTER TABLE "contractor_mail_messages" DROP CONSTRAINT "contractor_mail_messages_from_display_name_length_check";
ALTER TABLE "contractor_mail_messages" DROP COLUMN "from_display_name";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260924213126_contractor_mail_from_display_name';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one contractor_mail_from_display_name migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
