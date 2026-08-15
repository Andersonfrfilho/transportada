-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz o canal de ativação por empresa. Depois deste rollback toda entrega volta a ser e-mail:
-- a escolha de quem migrou para sms/whatsapp é perdida e precisa ser refeita na configuração.
BEGIN;

ALTER TABLE "company_fiscal_profiles"
  DROP CONSTRAINT IF EXISTS "company_fiscal_profiles_activation_channel_check";

ALTER TABLE "company_fiscal_profiles" DROP COLUMN IF EXISTS "activation_channel";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260812180149_company_activation_channel'
      AND "hash" = 'ae1756709b5abdbf6ca2dc28730287593da991299baf1f4ddb6a357bf35347fc';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_activation_channel migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
