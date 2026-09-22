-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 150 T402: a tabela `contractor_mail_templates` e a coluna
-- `contractor_mail_messages.template_id` (com a FK composta). Perde os modelos cadastrados e o
-- registro de qual modelo cada mensagem usou; o corpo enviado continua em `body_html`/`body_text`.
-- ⚠️ Com a tabela fora, a API da T402 não sobe e o envio de correção recusa: reverta o código junto.
BEGIN;

ALTER TABLE "contractor_mail_messages" DROP CONSTRAINT IF EXISTS "contractor_mail_messages_template_fk";
ALTER TABLE "contractor_mail_messages" DROP COLUMN IF EXISTS "template_id";
DROP TABLE IF EXISTS "contractor_mail_templates";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260915230000_contractor_mail_templates';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one contractor_mail_templates journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
