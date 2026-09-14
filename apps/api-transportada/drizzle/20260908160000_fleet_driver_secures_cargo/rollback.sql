-- ⚠️ Devolve o esquema e **não** os valores: quem tinha declarado que amarra a carga precisa
-- declarar de novo, e até lá a planta desenha a pilha limitada por esbeltez.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260908160000_fleet_driver_secures_cargo';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_driver_secures_cargo journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

ALTER TABLE "fleet_drivers" DROP COLUMN IF EXISTS "secures_cargo";
