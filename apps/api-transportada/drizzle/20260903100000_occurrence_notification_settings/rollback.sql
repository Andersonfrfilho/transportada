-- Devolve o schema ao estado anterior, e apaga a propria linha do journal: sem isso o Drizzle
-- considera a migration aplicada e o proximo deploy falha ao tentar recriar a tabela.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260903100000_occurrence_notification_settings';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_notification_settings journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

DROP TABLE IF EXISTS "company_occurrence_notification_settings";
