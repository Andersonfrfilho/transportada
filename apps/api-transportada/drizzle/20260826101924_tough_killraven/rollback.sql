-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a spec 057, T005: a rotina de expurgo da coordenada sai do catálogo do relógio.
--
-- Reverter isto **não devolve** coordenada nenhuma: o que a rotina apagou já foi apagado, e é para
-- isso que ela existe. O que se perde é o cumprimento do prazo daqui para a frente — a partir do
-- rollback, a coordenada de entrega passa a ser retida sem limite, contra a ADR-0045 §3.3. Se o
-- rollback for definitivo, a retenção precisa de outro dono, e `docs/SECURITY.md` precisa dizer qual.
BEGIN;

DELETE FROM "job_executions" WHERE "job" = 'trip.location.purge';
DELETE FROM "job_schedules" WHERE "job" = 'trip.location.purge';

ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check",
  ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run'));
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check",
  ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260826101924_tough_killraven'
      AND "hash" = '38ed4f83470d40a33139b93a89684622b9b6aa4cc3da675380122810fc9f1cae';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one tough_killraven migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
