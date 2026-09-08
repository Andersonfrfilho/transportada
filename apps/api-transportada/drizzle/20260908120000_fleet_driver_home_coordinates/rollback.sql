-- Devolve o esquema anterior. A coordenada é cópia do que o provedor devolveu na busca do cadastro:
-- reverter descarta a cópia, e o endereço em texto — que é a fonte — continua na ficha.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260908120000_fleet_driver_home_coordinates';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_driver_home_coordinates journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_home_coordinates_check";
ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "home_longitude";
ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "home_latitude";
