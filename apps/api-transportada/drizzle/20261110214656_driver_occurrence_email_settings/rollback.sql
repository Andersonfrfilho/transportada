-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 322: remove o interruptor do e-mail do aviso da ocorrência do motorista.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar com linha gravada: apagar a tabela religaria o e-mail de uma empresa
-- que mandou desligar.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  configured_companies integer;
BEGIN
  SELECT count(*) INTO configured_companies FROM "company_driver_occurrence_email_settings";
  IF configured_companies > 0 THEN
    RAISE EXCEPTION 'company_driver_occurrence_email_settings has % rows; refusing to drop it', configured_companies;
  END IF;
END
$$;

DROP TABLE "company_driver_occurrence_email_settings";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261110214656_driver_occurrence_email_settings';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one driver_occurrence_email_settings journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
