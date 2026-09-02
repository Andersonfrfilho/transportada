-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Tira a população adiantada de coordenadas do relógio (spec 069).
--
-- Reverter isto **não apaga** coordenada nenhuma: o que já está em `geocoded_addresses` continua
-- servindo, e é permanente por decisão da ADR-0044 §3. O que se perde é o adiantamento — a sugestão
-- volta a resolver o endereço novo no momento em que alguém a pede, que é o comportamento da RF2 e
-- continua correto, só mais lento na primeira vez.
BEGIN;

DELETE FROM "job_executions" WHERE "job" = 'geocoding.backfill';
DELETE FROM "job_schedules" WHERE "job" = 'geocoding.backfill';

ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check",
  ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill'));
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check",
  ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260901214952_geocoding_backfill_job';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one geocoding_backfill_job journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
