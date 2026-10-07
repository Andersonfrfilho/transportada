-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a correção M1 da spec 237: devolve os três CHECKs à forma de `20261003204733_cargo_arrivals`,
-- que deixa passar a combinação com NULL. Nada se apaga — toda linha que cumpre o CHECK novo cumpre o
-- antigo, então o ADD volta sem varredura que reprove.
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "cargo_arrivals"
  DROP CONSTRAINT IF EXISTS "cargo_arrivals_separation_due_at_check",
  ADD CONSTRAINT "cargo_arrivals_separation_due_at_check" CHECK (("separation_window_hours" is null and "separation_due_at" is null) or extract(epoch from "separation_due_at" - "arrived_at") = "separation_window_hours" * 3600);

ALTER TABLE "cargo_arrival_documents"
  DROP CONSTRAINT IF EXISTS "cargo_arrival_documents_state_dates_check",
  ADD CONSTRAINT "cargo_arrival_documents_state_dates_check" CHECK (("separation_state" = 'expected' and "received_at" is null and "separated_at" is null) or ("separation_state" = 'received' and "received_at" is not null and "separated_at" is null) or ("separation_state" = 'separated' and "received_at" is not null and "separated_at" >= "received_at"));

ALTER TABLE "cargo_arrival_events"
  DROP CONSTRAINT IF EXISTS "cargo_arrival_events_state_shape_check",
  ADD CONSTRAINT "cargo_arrival_events_state_shape_check" CHECK (case "kind" when 'document_added' then "from_state" is null and "to_state" = 'expected' when 'document_received' then "from_state" = 'expected' and "to_state" = 'received' when 'document_separated' then "from_state" = 'received' and "to_state" = 'separated' else "from_state" is null and "to_state" is null end);

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261006144825_cargo_arrival_check_null_holes';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cargo_arrival_check_null_holes journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
