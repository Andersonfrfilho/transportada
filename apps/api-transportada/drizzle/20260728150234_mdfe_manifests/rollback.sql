-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the MDF-e manifest model: header, crew, items, loading cities, fiscal documents and the
-- issuance rail (attempts, events and outbox).
-- Destructive: every manifest and its authorized/closed/cancelled fiscal trail is discarded. The
-- CT-e tables are untouched — dropping mdfe_manifest_items only releases the CT-es for a new
-- manifest.
BEGIN;

DROP TABLE "mdfe_issuance_outbox";

DROP TABLE "mdfe_issuance_events";

DROP TABLE "mdfe_fiscal_documents";

DROP TABLE "mdfe_issuance_attempts";

DROP TABLE "mdfe_manifest_loading_cities";

DROP TABLE "mdfe_manifest_items";

DROP TABLE "mdfe_manifest_drivers";

DROP TABLE "mdfe_manifests";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260728150234_mdfe_manifests'
      AND "hash" = '86455117d06065d17a0a33bded9de01d9d5875aa291ec9dc3fdfb4ce06a11f99';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one mdfe_manifests migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
