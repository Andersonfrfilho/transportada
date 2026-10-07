-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 237 T4.2: apaga as prévias, os itens, os vínculos com as notas, os pares roteiro ↔
-- carga, os aliases aprendidos, a trilha e os pedidos ao worker. ⚠️ Os vínculos confirmados à mão e
-- os aliases se perdem com as tabelas: confira antes (select count(*) from cargo_preview_events) e
-- guarde o que precisar. Os arquivos no bucket NÃO são apagados por este script.
BEGIN;

DROP TRIGGER IF EXISTS "cargo_preview_events_append_only_trigger" ON "cargo_preview_events";
DROP FUNCTION IF EXISTS "reject_cargo_preview_events_mutation"();
DROP TABLE IF EXISTS "cargo_preview_outbox";
DROP TABLE IF EXISTS "cargo_preview_events";
DROP TABLE IF EXISTS "contractor_recipient_aliases";
DROP TABLE IF EXISTS "cargo_preview_items";
DROP TABLE IF EXISTS "cargo_preview_route_loads";
DROP TABLE IF EXISTS "cargo_preview_document_links";
DROP TABLE IF EXISTS "cargo_previews";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261004140624_cargo_previews';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cargo_previews journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
