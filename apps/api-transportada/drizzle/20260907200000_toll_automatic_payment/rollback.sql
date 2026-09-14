-- Devolve o esquema anterior. ⚠️ `has_automatic_toll_payment` e as duas colunas de tarifa
-- automática saem com o valor que a empresa tiver digitado: é o preço aceito de reverter uma
-- correção manual, o mesmo já pago pela migration que criou `company_toll_booth_charges`.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260907200000_toll_automatic_payment';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one toll_automatic_payment journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

ALTER TABLE "fleet_vehicles" DROP COLUMN IF EXISTS "has_automatic_toll_payment";

ALTER TABLE "company_toll_booth_charges" DROP CONSTRAINT IF EXISTS "company_toll_booth_charges_charge_per_axle_automatic_check";
ALTER TABLE "company_toll_booth_charges" DROP CONSTRAINT IF EXISTS "company_toll_booth_charges_charge_presence_check";
ALTER TABLE "company_toll_booth_charges" ADD CONSTRAINT "company_toll_booth_charges_charge_presence_check" CHECK ("charge_per_axle" is not null or "charge_car" is not null);
ALTER TABLE "company_toll_booth_charges" DROP COLUMN IF EXISTS "charge_per_axle_automatic";

ALTER TABLE "toll_booths" DROP CONSTRAINT IF EXISTS "toll_booths_charge_per_axle_automatic_check";
ALTER TABLE "toll_booths" DROP COLUMN IF EXISTS "charge_per_axle_automatic";
