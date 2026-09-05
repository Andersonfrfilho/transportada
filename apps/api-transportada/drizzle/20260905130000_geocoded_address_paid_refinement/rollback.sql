-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Tira do relógio a escalada automática ao provedor pago (ADR-0062).
--
-- ⚠️ Reverter isto **apaga o registro de que já pagamos** por cada endereço: `paid_refined_at` some
-- com a coluna. As coordenadas compradas ficam — elas são permanentes pela ADR-0044 §3 —, mas se a
-- migration for reaplicada depois, todo endereço que ainda estiver em `city` volta a ser candidato
-- e é cobrado de novo. Reaplicar não é de graça.
BEGIN;

DELETE FROM "job_executions" WHERE "job" = 'geocoding.refine';
DELETE FROM "job_schedules" WHERE "job" = 'geocoding.refine';

ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check",
  ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill'));
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check",
  ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill'));

DROP INDEX IF EXISTS "geocoded_addresses_pending_paid_refinement_idx";
ALTER TABLE "geocoded_addresses" DROP COLUMN "paid_refined_at";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260905130000_geocoded_address_paid_refinement';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one geocoded_address_paid_refinement journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
