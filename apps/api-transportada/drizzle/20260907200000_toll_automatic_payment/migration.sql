-- A praça tem dois preços, e quem decide qual vale é o veículo (spec 095 D3).
--
-- ⚠️ O OSM não tem a tarifa de quem paga com tag: `toll_booths.charge_per_axle_automatic` e
-- `company_toll_booth_charges.charge_per_axle_automatic` nascem nulas, e só passam a existir por
-- ajuste da empresa ou, um dia, por curadoria oficial. `fleet_vehicles.has_automatic_toll_payment`
-- é quem decide, por veículo, se a automática entra na conta — frota mista é o caso normal.
ALTER TABLE "toll_booths" ADD COLUMN "charge_per_axle_automatic" numeric(19,4);
--> statement-breakpoint
ALTER TABLE "toll_booths" ADD CONSTRAINT "toll_booths_charge_per_axle_automatic_check" CHECK ("charge_per_axle_automatic" is null or "charge_per_axle_automatic" >= 0);
--> statement-breakpoint
ALTER TABLE "company_toll_booth_charges" ADD COLUMN "charge_per_axle_automatic" numeric(19,4);
--> statement-breakpoint
ALTER TABLE "company_toll_booth_charges" DROP CONSTRAINT "company_toll_booth_charges_charge_presence_check";
--> statement-breakpoint
ALTER TABLE "company_toll_booth_charges" ADD CONSTRAINT "company_toll_booth_charges_charge_presence_check" CHECK ("charge_per_axle" is not null or "charge_car" is not null or "charge_per_axle_automatic" is not null);
--> statement-breakpoint
ALTER TABLE "company_toll_booth_charges" ADD CONSTRAINT "company_toll_booth_charges_charge_per_axle_automatic_check" CHECK ("charge_per_axle_automatic" is null or "charge_per_axle_automatic" >= 0);
--> statement-breakpoint
ALTER TABLE "fleet_vehicles" ADD COLUMN "has_automatic_toll_payment" boolean DEFAULT false NOT NULL;
