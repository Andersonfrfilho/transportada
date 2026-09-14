-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a prévia congelada do comando pelo WhatsApp e o diário de passos (spec 144 T011).
-- Perde os pedidos e o diário: confirmação em curso não é retomável e liquidação pendente não
-- fecha. Os documentos fiscais já criados ficam onde estão — só se perde o elo com o pedido.
BEGIN;

DROP TABLE IF EXISTS "whatsapp_command_documents";

DROP TABLE IF EXISTS "whatsapp_command_requests";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260912132407_whatsapp_command_requests'
      AND "hash" = '008024bb0d1a1312c831a8d9d8c1366e92acf34ddd7027833a54d9ea0df9e298';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one whatsapp_command_requests migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
