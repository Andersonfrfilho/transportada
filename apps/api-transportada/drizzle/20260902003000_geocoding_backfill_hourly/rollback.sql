-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Devolve a população de coordenadas à batida de cinco minutos (spec 069).
--
-- ⚠️ Reverter isto **volta a cadência agressiva**: 5 minutos é o piso da batida, e com os lotes
-- atuais dá até 6.000 requisições por hora contra a BrasilAPI, que é serviço público e gratuito.
-- O motivo de a rotina ser lenta não é performance nossa — é cortesia com um terceiro que pode nos
-- bloquear, e um bloqueio derruba o degrau 1 da instalação inteira.
--
-- Não há dado a perder: as coordenadas já gravadas ficam, e o que muda é só de quanto em quanto
-- tempo a fila anda.
BEGIN;

UPDATE "job_schedules"
  SET "interval_seconds" = 300
  WHERE "job" = 'geocoding.backfill';

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260902003000_geocoding_backfill_hourly';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one geocoding_backfill_hourly journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
