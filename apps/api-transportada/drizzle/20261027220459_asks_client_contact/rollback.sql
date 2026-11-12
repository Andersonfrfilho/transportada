-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 281 T8b: tira o ajuste "pedir o contato do cliente na abertura da ocorrencia". Sem recusa: a coluna so liga uma
-- pergunta no app do motorista; os contatos ja guardados ficam em `delivery_client_contacts`.
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "company_occurrence_types" DROP COLUMN "asks_client_contact";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261027220459_asks_client_contact';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one asks_client_contact journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
