-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 232 T1.5: o índice do momento da entrega e as colunas da hora corrigida.
--
-- ⚠️ Reverter só com a API também revertida — a API desta spec grava e lê `occurred_at`. O que se
-- perde é a hora corrigida dos eventos e o desvio que julgou cada foto: a nota volta a ler
-- `captured_at ?? recorded_at`, e o `tapped_at` cru continua no evento. Nenhum veredito é apagado.
BEGIN;

DROP INDEX IF EXISTS "trip_stop_events_company_delivered_moment_idx";

ALTER TABLE "trip_stop_events"
  DROP COLUMN IF EXISTS "clock_offset_ms",
  DROP COLUMN IF EXISTS "occurred_at";

ALTER TABLE "trip_delivery_proofs"
  DROP COLUMN IF EXISTS "clock_offset_ms";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261002213734_delivered_moment_clock';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivered_moment_clock journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
