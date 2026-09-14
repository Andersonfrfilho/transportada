-- ⚠️ Devolve o esquema e **não** as horas: os ETAs já deslocados continuam deslocados, e é o certo —
-- eles foram ancorados na saída real, que aconteceu. O que se perde é a âncora, e sem ela o próximo
-- despacho volta a não deslocar nada.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260909210000_trip_eta_departure_anchor';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_eta_departure_anchor journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

ALTER TABLE "trips" DROP COLUMN IF EXISTS "eta_departure_at";
ALTER TABLE "route_suggestions" DROP COLUMN IF EXISTS "planned_departure_at";
