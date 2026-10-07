-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 237 T4.6: apaga o registro dos e-mails encaminhados, tira as três colunas do perfil de
-- recebimento (o token e as duas listas) e devolve a prévia ao formato só-upload. ⚠️ Prévia que veio por
-- e-mail (`source = 'email'`, sem quem enviou) não cabe no formato antigo: o script RECUSA reverter
-- enquanto existir uma — confira antes (select count(*) from cargo_previews where source = 'email')
-- e decida o que fazer com ela. O MIME bruto e a planilha no bucket NÃO são apagados por este script.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "cargo_previews" WHERE "source" <> 'upload' OR "uploaded_by_user_id" IS NULL) THEN
    RAISE EXCEPTION 'cargo_previews has email previews; resolve them before rolling back';
  END IF;
END
$$;

DROP TRIGGER IF EXISTS "cargo_preview_email_intakes_append_only_trigger" ON "cargo_preview_email_intakes";
DROP FUNCTION IF EXISTS "reject_cargo_preview_email_intakes_mutation"();
DROP TABLE IF EXISTS "cargo_preview_email_intakes";

ALTER TABLE "cargo_previews"
  DROP CONSTRAINT IF EXISTS "cargo_previews_source_check",
  DROP CONSTRAINT IF EXISTS "cargo_previews_uploader_check",
  ADD CONSTRAINT "cargo_previews_source_check" CHECK ("source" in ('upload'));
ALTER TABLE "cargo_previews" ALTER COLUMN "uploaded_by_user_id" SET NOT NULL;

DROP INDEX IF EXISTS "contractor_receiving_profiles_company_inbound_token_unique";
ALTER TABLE "contractor_receiving_profiles"
  DROP CONSTRAINT IF EXISTS "contractor_receiving_profiles_preview_inbound_allowlists_check",
  DROP CONSTRAINT IF EXISTS "contractor_receiving_profiles_preview_sender_allowlist_check",
  DROP CONSTRAINT IF EXISTS "contractor_receiving_profiles_preview_forwarder_allowlist_check",
  DROP CONSTRAINT IF EXISTS "contractor_receiving_profiles_preview_inbound_token_hash_check",
  DROP COLUMN IF EXISTS "preview_sender_allowlist",
  DROP COLUMN IF EXISTS "preview_forwarder_allowlist",
  DROP COLUMN IF EXISTS "preview_inbound_token_hash";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261007024527_cargo_preview_email_intake';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cargo_preview_email_intake journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
