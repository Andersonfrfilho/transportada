-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Tira do relógio o expurgo de 24 h da prévia da planta (spec 145 D19).
--
-- ⚠️ Sem a rotina, a prévia que não virou viagem volta a guardar nome de cliente e endereço sem
-- prazo. Reverter só com o worker também revertido — senão a batida publica um job que o CHECK recusa.
BEGIN;

DELETE FROM "job_executions" WHERE "job" = 'trip.cargo-layout.purge';
DELETE FROM "job_schedules" WHERE "job" = 'trip.cargo-layout.purge';

ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check",
  ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine'));
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check",
  ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260913120000_trip_cargo_layout_purge_job';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_cargo_layout_purge_job journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
