-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Tira o modelo do modulo de notificacao do tipo de ocorrencia, as listas de copia e destinatarios e o rastreio da mensagem.
-- ATENCAO: as escolhas do tipo (chave do modelo, responsaveis em copia, destinatarios) sao descartadas de proposito.
BEGIN;

SET LOCAL lock_timeout = '3s';

DROP TABLE "company_occurrence_type_watchers";
DROP TABLE "company_occurrence_type_recipients";
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT "company_occurrence_types_contractor_notification_template_key_check";
ALTER TABLE "company_occurrence_types" DROP COLUMN "contractor_notification_template_selected_at";
ALTER TABLE "company_occurrence_types" DROP COLUMN "contractor_notification_template_key";
ALTER TABLE "contractor_mail_messages" DROP COLUMN "notification_template_version";
ALTER TABLE "contractor_mail_messages" DROP COLUMN "notification_template_key";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261017041702_occurrence_type_contractor_mail';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_type_contractor_mail journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
