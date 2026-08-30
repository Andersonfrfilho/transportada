-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a rotina de backfill do documento: ela sai do catálogo do relógio.
--
-- Reverter isto **não apaga** o `tax_id` que já foi escrito no Keycloak — o atributo vive lá, fora
-- do alcance desta migration, e continua sendo lido pela reconciliação. O que se perde é a passada
-- automática sobre quem ainda não tem o atributo: daí em diante só o convite e a edição o escrevem,
-- e quem ninguém tocar segue fora do casamento por documento.
BEGIN;

DELETE FROM "job_executions" WHERE "job" = 'identity.document.backfill';
DELETE FROM "job_schedules" WHERE "job" = 'identity.document.backfill';

ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check",
  ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge'));
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check",
  ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260829224254_identity_document_backfill_job'
      AND "hash" = 'c54f913e5ab611c79dd6e64a392d4e9be1ab67bd8e8e7d27042199a01661c9ed';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one identity_document_backfill_job migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
