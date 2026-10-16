-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Tira a escolha de modelo do tipo de ocorrência e da exceção por contratante e devolve a CHECK do tipo de e-mail.
-- ⚠️ A escolha do modelo é descartada (o texto dos modelos `occurrence` continua no cadastro). A CHECK volta a
-- `('address_correction')` como NOT VALID: modelos `occurrence` já gravados ficam, mas nada novo entra.
BEGIN;

SET LOCAL lock_timeout = '3s';

DROP INDEX "occurrence_type_contractor_overrides_mail_template_idx";
DROP INDEX "company_occurrence_types_mail_template_idx";
ALTER TABLE "company_occurrence_type_contractor_overrides" DROP CONSTRAINT "occurrence_type_contractor_overrides_mail_template_fk";
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT "company_occurrence_types_mail_template_fk";
ALTER TABLE "company_occurrence_type_contractor_overrides" DROP COLUMN "contractor_mail_template_id";
ALTER TABLE "company_occurrence_types" DROP COLUMN "contractor_mail_template_id";
ALTER TABLE "contractor_mail_templates" DROP CONSTRAINT "contractor_mail_templates_mail_type_check";
ALTER TABLE "contractor_mail_templates" ADD CONSTRAINT "contractor_mail_templates_mail_type_check" CHECK ("mail_type" in ('address_correction')) NOT VALID;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261016165917_occurrence_mail_template';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_mail_template journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
