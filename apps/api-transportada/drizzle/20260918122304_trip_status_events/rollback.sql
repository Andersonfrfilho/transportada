-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 158 T2 (ADR-0068 §1/§3): a tabela `trip_status_events` e o canal `backoffice` no
-- vocabulário das seis tabelas de campo (trip_document_events, trip_stop_events,
-- trip_stop_occurrences, trip_field_reports, trip_delivery_proofs, trip_document_occurrences).
--
-- ⚠️ Este rollback FALHA se `trip_status_events` já tiver qualquer linha, ou se `channel =
-- 'backoffice'` já tiver sido gravado em qualquer uma das seis tabelas: apagar a tabela ou encolher
-- o vocabulário devolveria histórico de status ou de canal para um estado que nunca existiu — pior
-- que não ter a coluna. Nesse caso não desfaz — a migration nova só alargou o que já existia.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "trip_status_events") THEN
    RAISE EXCEPTION 'trip_status_events has rows, refusing rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM "trip_document_events" WHERE "channel" = 'backoffice') THEN
    RAISE EXCEPTION 'trip_document_events has rows with channel backoffice, refusing rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM "trip_stop_events" WHERE "channel" = 'backoffice') THEN
    RAISE EXCEPTION 'trip_stop_events has rows with channel backoffice, refusing rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM "trip_stop_occurrences" WHERE "channel" = 'backoffice') THEN
    RAISE EXCEPTION 'trip_stop_occurrences has rows with channel backoffice, refusing rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM "trip_field_reports" WHERE "channel" = 'backoffice') THEN
    RAISE EXCEPTION 'trip_field_reports has rows with channel backoffice, refusing rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM "trip_delivery_proofs" WHERE "channel" = 'backoffice') THEN
    RAISE EXCEPTION 'trip_delivery_proofs has rows with channel backoffice, refusing rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM "trip_document_occurrences" WHERE "channel" = 'backoffice') THEN
    RAISE EXCEPTION 'trip_document_occurrences has rows with channel backoffice, refusing rollback';
  END IF;
END
$$;

ALTER TABLE "trip_delivery_proofs"
  DROP CONSTRAINT "trip_delivery_proofs_channel_check",
  ADD CONSTRAINT "trip_delivery_proofs_channel_check" CHECK ("channel" in ('driver_app', 'office', 'whatsapp'));
ALTER TABLE "trip_document_events"
  DROP CONSTRAINT "trip_document_events_channel_check",
  ADD CONSTRAINT "trip_document_events_channel_check" CHECK ("channel" in ('driver_app', 'office', 'whatsapp'));
ALTER TABLE "trip_document_occurrences"
  DROP CONSTRAINT "trip_document_occurrences_channel_check",
  ADD CONSTRAINT "trip_document_occurrences_channel_check" CHECK ("channel" in ('driver_app', 'office', 'whatsapp'));
ALTER TABLE "trip_field_reports"
  DROP CONSTRAINT "trip_field_reports_channel_check",
  ADD CONSTRAINT "trip_field_reports_channel_check" CHECK ("channel" in ('driver_app', 'office', 'whatsapp'));
ALTER TABLE "trip_stop_events"
  DROP CONSTRAINT "trip_stop_events_channel_check",
  ADD CONSTRAINT "trip_stop_events_channel_check" CHECK ("channel" in ('driver_app', 'office', 'whatsapp'));
ALTER TABLE "trip_stop_occurrences"
  DROP CONSTRAINT "trip_stop_occurrences_channel_check",
  ADD CONSTRAINT "trip_stop_occurrences_channel_check" CHECK ("channel" in ('driver_app', 'office', 'whatsapp'));

DROP TABLE "trip_status_events";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260918122304_trip_status_events';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_status_events journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
