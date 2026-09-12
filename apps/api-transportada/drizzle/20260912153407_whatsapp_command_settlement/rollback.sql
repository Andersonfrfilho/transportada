-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a liquidação dos pedidos de WhatsApp (spec 144 T014): a rotina sai do catálogo do relógio
-- e o `settlement_outcome` volta a ser texto sem vocabulário.
--
-- Reverter isto **não desfaz** fatura já criada nem pedido já liquidado: as faturas continuam no
-- faturamento e o pedido continua `settled`/`settled_partial`. O que se perde é a varredura — os
-- pedidos ainda `dispatched` param de liquidar e os `confirming` parados param de ser retomados.
BEGIN;

DELETE FROM "job_executions" WHERE "job" = 'whatsapp.command.settle';
DELETE FROM "job_schedules" WHERE "job" = 'whatsapp.command.settle';

ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check",
  ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine'));
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check",
  ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine'));

ALTER TABLE "whatsapp_command_requests"
  DROP CONSTRAINT IF EXISTS "whatsapp_command_requests_settlement_outcome_check";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260912153407_whatsapp_command_settlement'
      AND "hash" = 'e37cf380d8166c39ca66bd7305fda12bc9236205e55f319f229a55e3c1422f57';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one whatsapp_command_settlement migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
