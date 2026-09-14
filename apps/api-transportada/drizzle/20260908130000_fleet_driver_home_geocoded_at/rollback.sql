-- Devolve o esquema anterior. Perde-se a marca de "já procurei", não a coordenada: quem reverter
-- volta a ter busca repetida para o motorista que o provedor não acha.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260908130000_fleet_driver_home_geocoded_at';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_driver_home_geocoded_at journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

ALTER TABLE "fleet_drivers" DROP CONSTRAINT IF EXISTS "fleet_drivers_home_geocoded_at_check";
ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "home_geocoded_at";
