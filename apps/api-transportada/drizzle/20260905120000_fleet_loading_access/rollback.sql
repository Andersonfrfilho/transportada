-- Devolve a coluna, nunca os valores: o que o operador digitou de porta lateral se perde, e ninguem
-- consegue redescobrir isso do `body_type` — foi por a porta lateral NAO estar la que a coluna
-- nasceu. Em base nova o prejuizo e zero; com uso, cada ficha e uma volta ao patio com fita metrica.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260905120000_fleet_loading_access';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_loading_access journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

ALTER TABLE "fleet_vehicles" DROP CONSTRAINT IF EXISTS "fleet_vehicles_loading_access_check";
ALTER TABLE "fleet_vehicles" DROP COLUMN IF EXISTS "loading_access";
