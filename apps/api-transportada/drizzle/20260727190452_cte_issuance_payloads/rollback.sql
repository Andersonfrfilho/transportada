-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverts the table that stores the exact CT-e payload and provider config assembled for each
-- issuance attempt. Purely additive migration — no other table references it.
-- Destructive: the transmitted payload of every attempt is lost, so the audit trail linking an
-- authorized CT-e to the data it was built from disappears. Export cte_issuance_payloads before
-- running.
BEGIN;

DROP TABLE "cte_issuance_payloads";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260727190452_cte_issuance_payloads'
      AND "hash" = '2aa467cda877fb7e20b0529e132d4b5021e13f1ea986329babe3a346e9ad61b7';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cte_issuance_payloads migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
