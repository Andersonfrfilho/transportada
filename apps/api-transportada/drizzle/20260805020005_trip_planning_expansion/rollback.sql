-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the trip-planning expansion (ADR-0023, spec 027 T001): trips, trip_drivers,
-- trip_documents and the nullable mdfe_manifests.trip_id.
-- Destructive: every trip, trip driver and trip document row is discarded. Only run this before
-- the backfill (spec 027 T002) has been applied to production data, or after confirming the
-- manifest -> trip link is not needed anymore.
BEGIN;

ALTER TABLE "mdfe_manifests" DROP CONSTRAINT "mdfe_manifests_company_trip_fk";

ALTER TABLE "mdfe_manifests" DROP COLUMN "trip_id";

DROP TABLE "trip_documents";

DROP TABLE "trip_drivers";

DROP TABLE "trips";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260805020005_trip_planning_expansion'
      AND "hash" = 'be1ae4fe717692eb495c2198299d21d5b30d8426fa23cfed53e07cf2b2b38325';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_planning_expansion migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
