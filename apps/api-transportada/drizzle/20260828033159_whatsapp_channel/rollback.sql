-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a spec 062 T001: a credencial do WhatsApp por empresa.
--
-- Reverter **apaga credencial selada**, e ela nao se reconstroi: o token de acesso da Meta so existe
-- dentro do envelope, e ninguem o le de volta em claro. Quem reverter vai precisar do token
-- original outra vez, no painel da Meta.
--
-- E **quebra** se algum canal ainda estiver ativo: apagar em silencio faria o convite e o aviso por
-- WhatsApp voltarem a falhar na entrega, sem que ninguem tivesse desligado o canal.
BEGIN;

DO $$
DECLARE
  affected integer;
BEGIN
  SELECT count(*) INTO affected FROM "whatsapp_channels" WHERE "status" = 'active';
  IF affected > 0 THEN
    RAISE EXCEPTION 'Active WhatsApp channels: %. Disable them before rolling back — the sealed token cannot be recovered.', affected;
  END IF;
END
$$;

DROP TABLE IF EXISTS "whatsapp_channels";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260828033159_whatsapp_channel'
      AND "hash" = '3eae8f0428c9457c0297dfbc7187ae4b3947e865c79f5cfc79c41d554560b327';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one whatsapp_channel migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
