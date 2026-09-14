-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 145 D5: a planta de carga guardada. Derrubar a tabela não perde dado de domínio: a planta é
-- derivada da viagem e das caixas, e o worker a recalcula a partir do primeiro pedido depois.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260913210100_trip_cargo_layouts';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_cargo_layouts journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

DROP TABLE IF EXISTS "trip_cargo_layouts";
