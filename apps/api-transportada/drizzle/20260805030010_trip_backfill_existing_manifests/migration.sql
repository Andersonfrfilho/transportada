-- Copyright (c) 2026 Ada Technology. MIT License.
-- Spec 027 T002: backfill de trips/trip_drivers para todo mdfe_manifests pré-existente, e
-- preenche mdfe_manifests.trip_id (a expansão em drizzle/20260805020005_trip_planning_expansion
-- deixou a coluna nullable de propósito, ADR-0023). Sem alteração de schema — só dados.
-- A viagem nasce 'closed' quando o manifesto já saiu de 'draft' (o processo fiscal já assumiu o
-- vínculo) e só fica 'open' quando o manifesto pré-existente ainda está em rascunho.
CREATE TEMP TABLE "trip_backfill_map" ON COMMIT DROP AS
SELECT
	"m"."id" AS "manifest_id",
	gen_random_uuid() AS "trip_id",
	"m"."company_id" AS "company_id",
	"m"."vehicle_id" AS "vehicle_id",
	CASE WHEN "m"."status" = 'draft' THEN 'open' ELSE 'closed' END AS "trip_status",
	"m"."created_at" AS "created_at",
	"m"."updated_at" AS "updated_at"
FROM "mdfe_manifests" "m"
WHERE "m"."trip_id" IS NULL;--> statement-breakpoint
INSERT INTO "trips" ("id", "company_id", "vehicle_id", "status", "created_at", "updated_at")
SELECT "trip_id", "company_id", "vehicle_id", "trip_status", "created_at", "updated_at"
FROM "trip_backfill_map";--> statement-breakpoint
INSERT INTO "trip_drivers" (
	"company_id", "trip_id", "driver_id", "driver_name", "driver_tax_id", "position", "created_at"
)
SELECT
	"map"."company_id",
	"map"."trip_id",
	"d"."driver_id",
	"d"."driver_name",
	"d"."driver_tax_id",
	"d"."position",
	"d"."created_at"
FROM "mdfe_manifest_drivers" "d"
JOIN "trip_backfill_map" "map" ON "map"."manifest_id" = "d"."manifest_id";--> statement-breakpoint
UPDATE "mdfe_manifests" "m"
SET "trip_id" = "map"."trip_id"
FROM "trip_backfill_map" "map"
WHERE "map"."manifest_id" = "m"."id";
