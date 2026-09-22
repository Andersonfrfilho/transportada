-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 150 T406: a tabela `rate_limit_windows` e a rotina `rate-limit.window.purge`.
--
-- ⚠️ Sem a tabela, a API da T406 responde 500 no envio de correção e no e-mail de teste (o limitador
-- é fail-closed). Reverter só com a API e o worker também revertidos — senão a batida publica um job
-- que o CHECK recusa. Perde só contagem de janela, nenhum dado de negócio.
BEGIN;

DELETE FROM "job_executions" WHERE "job" = 'rate-limit.window.purge';
DELETE FROM "job_schedules" WHERE "job" = 'rate-limit.window.purge';

ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check",
  ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge'));
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check",
  ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge'));

DROP TABLE IF EXISTS "rate_limit_windows";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260915233000_rate_limit_windows';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one rate_limit_windows journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
