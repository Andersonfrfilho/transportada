-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Devolve o rodado do MDF-e e a classe comercial às duas colunas, reconstruídos do tipo do veículo.
-- Recuperável, com uma exceção: veículo cuja classe foi digitada à mão contra o rodado sugerido
-- (rodado '01' com classe 'vuc') volta com rodado '06' — o par não era injetivo, e é por isso que
-- as duas colunas viraram uma.
BEGIN;

ALTER TABLE "fleet_vehicles" DROP CONSTRAINT IF EXISTS "fleet_vehicles_vehicle_type_check";

ALTER TABLE "fleet_vehicles" ADD COLUMN IF NOT EXISTS "wheel_type" varchar(2) DEFAULT '' NOT NULL;
ALTER TABLE "fleet_vehicles" ADD COLUMN IF NOT EXISTS "freight_class" varchar(20) DEFAULT '' NOT NULL;

UPDATE "fleet_vehicles" SET
  "wheel_type" = CASE "vehicle_type"
    WHEN 'truck' THEN '01'
    WHEN 'toco' THEN '02'
    WHEN 'tractor_unit' THEN '03'
    WHEN 'van' THEN '04'
    WHEN 'utility' THEN '05'
    WHEN '' THEN ''
    ELSE '06'
  END,
  "freight_class" = CASE "vehicle_type"
    WHEN 'utility' THEN 'utility'
    WHEN 'van' THEN 'van'
    WHEN 'vuc' THEN 'vuc'
    WHEN 'three_quarter' THEN 'three_quarter'
    WHEN 'toco' THEN 'toco'
    WHEN 'truck' THEN 'truck'
    ELSE ''
  END;

ALTER TABLE "fleet_vehicles" DROP COLUMN IF EXISTS "vehicle_type";

ALTER TABLE "fleet_vehicles" ADD CONSTRAINT "fleet_vehicles_wheel_type_check"
  CHECK (("role" = 'traction') = ("wheel_type" in ('01', '02', '03', '04', '05', '06')));
ALTER TABLE "fleet_vehicles" ADD CONSTRAINT "fleet_vehicles_freight_class_check"
  CHECK (length("freight_class") = 0 or "freight_class" in ('utility', 'van', 'vuc', 'three_quarter', 'toco', 'truck'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260821153330_fleet_vehicle_type'
      AND "hash" = '34433fcb1c8d540e71a7b296e92c663f6409894eed2226da18e5b657ca22e276';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one fleet_vehicle_type migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
