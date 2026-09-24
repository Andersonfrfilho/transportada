-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 164 T16: a tabela `trip_occurrence_item_settlements` (o acerto por item de uma
-- tratativa decidida `goods_paid`), movida da T1 para esta task porque ela e a cobrança que
-- alimenta (`delivery_charges`, migration seguinte) mexem no mesmo dinheiro.
--
-- O que se perde: qualquer acerto já gravado.
--
-- Recusa (RAISE) em vez de apagar dado de verdade: linha na tabela faz o rollback parar antes de
-- qualquer DDL.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "trip_occurrence_item_settlements") THEN
    RAISE EXCEPTION 'trip_occurrence_item_settlements has rows, refusing rollback';
  END IF;
END
$$;

DROP TABLE "trip_occurrence_item_settlements";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260922215410_trip_occurrence_item_settlements'
      AND "hash" = '5b15ada358d46df96e9bc4df19ba50197b6d79fe8c59f4864fda482b6ad367cc';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_occurrence_item_settlements migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
