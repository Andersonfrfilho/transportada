-- Devolve o CHECK único das três dimensões. Nenhuma linha se perde: o antigo `>= 0` é mais frouxo
-- que os tres que este rollback derruba, entao tudo o que passou continua passando.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260906120000_fleet_vehicle_cargo_dimension_bounds';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_vehicle_cargo_dimension_bounds journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

ALTER TABLE "fleet_vehicles" DROP CONSTRAINT IF EXISTS "fleet_vehicles_cargo_length_check";
ALTER TABLE "fleet_vehicles" DROP CONSTRAINT IF EXISTS "fleet_vehicles_cargo_width_check";
ALTER TABLE "fleet_vehicles" DROP CONSTRAINT IF EXISTS "fleet_vehicles_cargo_height_check";

ALTER TABLE "fleet_vehicles"
	ADD CONSTRAINT "fleet_vehicles_cargo_dimensions_check"
	CHECK ("cargo_length_m" >= 0 AND "cargo_width_m" >= 0 AND "cargo_height_m" >= 0);
