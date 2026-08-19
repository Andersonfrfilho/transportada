-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Narrows the vehicle color back to the Denatran list, dropping the market tones.
-- Destrutivo: veículo gravado com um dos cinco tons novos volta para "não informado", porque a
-- lista antiga não tem onde encaixá-lo. O CRLV é a fonte para recadastrar.
BEGIN;

UPDATE "fleet_vehicles" SET "color" = ''
  WHERE "color" IN ('azul_marinho', 'champanhe', 'creme', 'grafite', 'turquesa');

ALTER TABLE "fleet_vehicles" DROP CONSTRAINT "fleet_vehicles_color_check",
  ADD CONSTRAINT "fleet_vehicles_color_check" CHECK (length("color") = 0 or "color" in ('amarela', 'azul', 'bege', 'branca', 'cinza', 'dourada', 'fantasia', 'grena', 'laranja', 'marrom', 'prata', 'preta', 'rosa', 'roxa', 'verde', 'vermelha'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260819184128_fleet_vehicle_color_market_tones'
      AND "hash" = '9b4892f011d35e33d5eb6a77f8b4c51909ad4363ae8300de82543bfb5e86175a';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_vehicle_color_market_tones migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
