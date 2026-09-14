-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove o outbox do pedido de plano de carga (spec 145 D8, ADR-0053).
--
-- ⚠️ Pedido ainda não publicado **se perde com a tabela**. A planta em `trip_cargo_layouts`
-- continua intacta — quem perde é só o relay do worker, que nunca chegou a ver o evento. Um novo
-- pedido (mesma entrada, mesmo hash) reabre a linha `failed` e gera outro evento.
BEGIN;

DROP TABLE IF EXISTS "trip_cargo_layout_outbox";

ALTER TABLE "trip_cargo_layouts"
  DROP CONSTRAINT IF EXISTS "trip_cargo_layouts_company_id_id_unique";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260913210200_trip_cargo_layout_outbox';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_cargo_layout_outbox journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
