-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 281 T4: remove a configuracao do Evolution. Recusa quando ja existe configuracao: apagar a tabela perderia a chave selada
-- da instancia e o numero conectado ficaria sem dono na tela.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "whatsapp_evolution_settings") THEN
    RAISE EXCEPTION 'Refusing to drop whatsapp_evolution_settings: company configurations exist';
  END IF;
END
$$;

DROP TABLE "whatsapp_evolution_settings";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261027180116_whatsapp_evolution_settings';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one whatsapp_evolution_settings journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
