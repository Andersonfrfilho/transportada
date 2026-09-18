-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 156 T4 (ADR-0067 §2): canal, autoria e a hora de gravação nas seis tabelas de
-- campo (trip_document_events, trip_stop_events, trip_stop_occurrences, trip_field_reports,
-- trip_delivery_proofs, trip_document_occurrences).
--
-- ⚠️ Este rollback FALHA se alguma linha já tiver `channel <> 'driver_app'`: apagar a coluna
-- devolveria toda baixa do escritório e do WhatsApp para um registro sem autor nenhum — pior que
-- não ter a coluna. Nesse caso não desfaz — a coluna nova só alargou o que já existia.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "trip_document_events" WHERE "channel" <> 'driver_app') THEN
    RAISE EXCEPTION 'trip_document_events has rows with channel other than driver_app, refusing rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM "trip_stop_events" WHERE "channel" <> 'driver_app') THEN
    RAISE EXCEPTION 'trip_stop_events has rows with channel other than driver_app, refusing rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM "trip_stop_occurrences" WHERE "channel" <> 'driver_app') THEN
    RAISE EXCEPTION 'trip_stop_occurrences has rows with channel other than driver_app, refusing rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM "trip_field_reports" WHERE "channel" <> 'driver_app') THEN
    RAISE EXCEPTION 'trip_field_reports has rows with channel other than driver_app, refusing rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM "trip_delivery_proofs" WHERE "channel" <> 'driver_app') THEN
    RAISE EXCEPTION 'trip_delivery_proofs has rows with channel other than driver_app, refusing rollback';
  END IF;
  IF EXISTS (SELECT 1 FROM "trip_document_occurrences" WHERE "channel" <> 'driver_app') THEN
    RAISE EXCEPTION 'trip_document_occurrences has rows with channel other than driver_app, refusing rollback';
  END IF;
END
$$;

ALTER TABLE "trip_delivery_proofs" DROP CONSTRAINT "trip_delivery_proofs_office_driver_check";
ALTER TABLE "trip_delivery_proofs" DROP CONSTRAINT "trip_delivery_proofs_channel_check";
ALTER TABLE "trip_document_events" DROP CONSTRAINT "trip_document_events_office_driver_check";
ALTER TABLE "trip_document_events" DROP CONSTRAINT "trip_document_events_channel_check";
ALTER TABLE "trip_document_occurrences" DROP CONSTRAINT "trip_document_occurrences_office_driver_check";
ALTER TABLE "trip_document_occurrences" DROP CONSTRAINT "trip_document_occurrences_channel_check";
ALTER TABLE "trip_field_reports" DROP CONSTRAINT "trip_field_reports_office_driver_check";
ALTER TABLE "trip_field_reports" DROP CONSTRAINT "trip_field_reports_channel_check";
ALTER TABLE "trip_stop_events" DROP CONSTRAINT "trip_stop_events_office_driver_check";
ALTER TABLE "trip_stop_events" DROP CONSTRAINT "trip_stop_events_channel_check";
ALTER TABLE "trip_stop_occurrences" DROP CONSTRAINT "trip_stop_occurrences_office_driver_check";
ALTER TABLE "trip_stop_occurrences" DROP CONSTRAINT "trip_stop_occurrences_channel_check";

ALTER TABLE "trip_delivery_proofs" DROP CONSTRAINT "trip_delivery_proofs_company_driver_fk";
ALTER TABLE "trip_document_events" DROP CONSTRAINT "trip_document_events_company_driver_fk";
ALTER TABLE "trip_document_occurrences" DROP CONSTRAINT "trip_document_occurrences_company_driver_fk";
ALTER TABLE "trip_field_reports" DROP CONSTRAINT "trip_field_reports_company_driver_fk";
ALTER TABLE "trip_stop_events" DROP CONSTRAINT "trip_stop_events_company_driver_fk";
ALTER TABLE "trip_stop_occurrences" DROP CONSTRAINT "trip_stop_occurrences_company_driver_fk";

ALTER TABLE "trip_delivery_proofs" DROP COLUMN "on_behalf_of_driver_id";
ALTER TABLE "trip_delivery_proofs" DROP COLUMN "channel";
ALTER TABLE "trip_document_events" DROP COLUMN "recorded_at";
ALTER TABLE "trip_document_events" DROP COLUMN "on_behalf_of_driver_id";
ALTER TABLE "trip_document_events" DROP COLUMN "channel";
ALTER TABLE "trip_document_occurrences" DROP COLUMN "on_behalf_of_driver_id";
ALTER TABLE "trip_document_occurrences" DROP COLUMN "channel";
ALTER TABLE "trip_field_reports" DROP COLUMN "on_behalf_of_driver_id";
ALTER TABLE "trip_field_reports" DROP COLUMN "channel";
ALTER TABLE "trip_stop_events" DROP COLUMN "recorded_at";
ALTER TABLE "trip_stop_events" DROP COLUMN "on_behalf_of_driver_id";
ALTER TABLE "trip_stop_events" DROP COLUMN "channel";
ALTER TABLE "trip_stop_occurrences" DROP COLUMN "on_behalf_of_driver_id";
ALTER TABLE "trip_stop_occurrences" DROP COLUMN "channel";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260918054353_trip_field_authorship';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_field_authorship journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
