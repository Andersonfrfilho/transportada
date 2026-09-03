-- Devolve os tres valores ao CHECK e apaga a propria linha do journal: sem isso o Drizzle considera
-- a migration aplicada e o proximo deploy falha ao tentar reaplica-la.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260903120000_stop_occurrence_kind_overlap';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one stop_occurrence_kind_overlap journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

ALTER TABLE "trip_stop_occurrences"
	DROP CONSTRAINT "trip_stop_occurrences_kind_check";

ALTER TABLE "trip_stop_occurrences"
	ADD CONSTRAINT "trip_stop_occurrences_kind_check"
	CHECK ("kind" IN ('unexpected_charge', 'long_wait', 'dock_closed', 'appointment_required', 'damaged_goods', 'address_not_found', 'customer_closed', 'other'));
