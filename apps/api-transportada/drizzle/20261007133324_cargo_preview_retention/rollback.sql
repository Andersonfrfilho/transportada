-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 237 T4.8: a linha de `job_schedules` da rotina `cargo-preview.retention.apply`, o nome
-- dela nas duas CHECK de `job` e o evento `retention_applied` nas duas CHECK da trilha da prévia.
--
-- ⚠️ Reverter só com o worker também revertido — senão a batida publica um job que o CHECK recusa.
-- ⚠️ Recusa se já existir evento `retention_applied`: a trilha é append-only (trigger) e a CHECK antiga
-- não validaria com essas linhas. Nesse caso a retenção já rodou e o que ela apagou não volta; o
-- rollback correto é uma migration nova que mantém o evento.
BEGIN;

DO $$
DECLARE
  applied_events integer;
BEGIN
  SELECT count(*) INTO applied_events FROM "cargo_preview_events" WHERE "kind" = 'retention_applied';
  IF applied_events > 0 THEN
    RAISE EXCEPTION 'Cannot roll back cargo_preview_retention: % retention_applied event(s) exist',
      applied_events;
  END IF;
END
$$;

DELETE FROM "job_executions" WHERE "job" = 'cargo-preview.retention.apply';
DELETE FROM "job_schedules" WHERE "job" = 'cargo-preview.retention.apply';

ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check",
  ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read'));
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check",
  ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read'));

ALTER TABLE "cargo_preview_events" DROP CONSTRAINT "cargo_preview_events_kind_check",
  ADD CONSTRAINT "cargo_preview_events_kind_check" CHECK ("kind" in ('arrival_proposed', 'failed', 'item_ambiguous', 'item_confirmed', 'item_linked_manually', 'item_matched', 'item_suggested', 'item_unlinked', 'parsed', 'uploaded'));
ALTER TABLE "cargo_preview_events" DROP CONSTRAINT "cargo_preview_events_item_scope_check",
  ADD CONSTRAINT "cargo_preview_events_item_scope_check" CHECK (("kind" in ('uploaded', 'parsed', 'failed', 'arrival_proposed')) = ("item_id" is null));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261007133324_cargo_preview_retention';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cargo_preview_retention journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
