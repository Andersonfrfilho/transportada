-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove a referencia de cubagem por tipo e as dimensoes do bau (spec 075).
--
-- ⚠️ As dimensoes de `fleet_vehicles` sao trabalho humano: quem mediu o bau digitou. A referencia,
-- essa, e catalogo publico e o seed a refaz. Guarde as dimensoes antes de rodar isto.
--
-- O que se perde: a capacidade cai do primeiro degrau (medida) para o `capacity_m3` da ficha, e
-- veiculo sem ele fica sem capacidade — a ocupacao some da tela em vez de mostrar numero errado.

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260902150000_vehicle_volume_references';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one vehicle_volume_references journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

DROP TABLE IF EXISTS "vehicle_volume_references";

ALTER TABLE "fleet_vehicles"
	DROP CONSTRAINT IF EXISTS "fleet_vehicles_cargo_dimensions_check";

ALTER TABLE "fleet_vehicles"
	DROP COLUMN IF EXISTS "cargo_length_m",
	DROP COLUMN IF EXISTS "cargo_width_m",
	DROP COLUMN IF EXISTS "cargo_height_m";
