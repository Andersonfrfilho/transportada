-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Drops the frozen MDF-e issuance payloads.
-- Refuses to run while a payload is recorded: it is the only record of what was sent to SEFAZ.
BEGIN;

DO $$
DECLARE
  frozen_payloads integer;
BEGIN
  SELECT count(*) INTO frozen_payloads FROM "mdfe_issuance_payloads";
  IF frozen_payloads > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: % MDF-e issuance payload(s) still frozen', frozen_payloads;
  END IF;
END
$$;

DROP TABLE "mdfe_issuance_payloads";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260728165555_mdfe_issuance_payloads'
      AND "hash" = '7ab4a9f9ab7ec2c44b0d5a8c2e5683be79040c21703fd05eb12b4265318915d6';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one mdfe_issuance_payloads migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
