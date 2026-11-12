-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 285: remove a tabela de automacoes do fluxo semanal. Perde so a configuracao (interruptor, destinatarios, prazo);
-- nada fiscal depende dela. Recusa se a tabela tiver linhas, para ninguem apagar configuracao sem querer.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "contractor_automations") THEN
    RAISE EXCEPTION 'contractor_automations has rows; export or delete them before rolling back';
  END IF;
END
$$;

DROP TABLE "contractor_automations";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261028145847_contractor_automations';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one contractor_automations journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
