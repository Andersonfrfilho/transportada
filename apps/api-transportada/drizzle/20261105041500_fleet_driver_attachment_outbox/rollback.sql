-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 091 T013: remove a fila de leitura da CNH do motorista. Pedido ainda não publicado se perde: a CNH
-- anexada continua no bucket e na ficha, só deixa de ser lida.
BEGIN;

SET LOCAL lock_timeout = '3s';

DROP TABLE "fleet_driver_attachment_outbox";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261105041500_fleet_driver_attachment_outbox';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_driver_attachment_outbox journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
