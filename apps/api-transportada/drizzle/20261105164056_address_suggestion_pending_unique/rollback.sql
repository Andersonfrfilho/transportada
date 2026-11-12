-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 294 S9: remove o índice da sugestão pendente por endereço.
BEGIN;

SET LOCAL lock_timeout = '3s';

DROP INDEX "address_correction_suggestions_company_address_pending_unique";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261105164056_address_suggestion_pending_unique';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one address_suggestion_pending_unique journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
