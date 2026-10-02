-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 222 T5.3/T5.3b: o índice e a coluna da leitura de canhoto, a linha de
-- `job_schedules` da rotina `trip.canhoto.read` e o nome dela nas duas CHECK.
--
-- ⚠️ Reverter só com o worker também revertido — senão a batida publica um job que o CHECK recusa.
-- Apagar `canhoto_read_attempted_at` perde só o carimbo "a máquina já tentou": o canhoto sem
-- código de barras volta à fila se a rotina for religada. Nenhum veredito nem leitura é apagado.
BEGIN;

DROP INDEX "trip_delivery_proofs_canhoto_pending_idx";
ALTER TABLE "trip_delivery_proofs" DROP COLUMN "canhoto_read_attempted_at";

DELETE FROM "job_executions" WHERE "job" = 'trip.canhoto.read';
DELETE FROM "job_schedules" WHERE "job" = 'trip.canhoto.read';

ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check",
  ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire'));
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check",
  ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261002120000_trip_canhoto_read_job';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_canhoto_read_job journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
