-- Rollback manual da 20260903200000_occurrence_email_template_key.
-- Some a selecao de template do modulo; email_subject/email_body nunca sairam da tabela,
-- entao nenhum texto legado se perde.
ALTER TABLE "company_occurrence_types" DROP COLUMN "email_template_key";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260903200000_occurrence_email_template_key';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_email_template_key journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;
