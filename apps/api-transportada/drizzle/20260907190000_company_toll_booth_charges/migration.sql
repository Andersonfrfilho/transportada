-- O ajuste manual da tarifa de pedágio, por empresa e por praça (spec 095 D1/D2).
--
-- ⚠️ Ao contrário de `toll_booths`, esta tabela TEM `company_id` e é assertada como âncora ao
-- tenant em `test/fleet-schema/tenant-safety.contract.ts`. O catálogo do OSM é público; o ajuste é
-- decisão de uma transportadora.
--
-- ⚠️ O valor efetivo é `ajuste ?? tarifa do catálogo`, resolvido num lugar só, no molde de
-- `company_fuel_prices`/`fuel-price.policy.ts`. Ausência de linha é ausência de ajuste; `0.00`
-- gravado aqui é isenção afirmada por gente, com autor e data.
CREATE TABLE "company_toll_booth_charges" (
	"company_id" uuid NOT NULL,
	"osm_node_id" bigint NOT NULL,
	"charge_per_axle" numeric(19,4),
	"charge_car" numeric(19,4),
	"observed_on" date NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_toll_booth_charges_company_id_osm_node_id_pk" PRIMARY KEY("company_id","osm_node_id"),
	CONSTRAINT "company_toll_booth_charges_charge_per_axle_check" CHECK ("charge_per_axle" is null or "charge_per_axle" >= 0),
	CONSTRAINT "company_toll_booth_charges_charge_car_check" CHECK ("charge_car" is null or "charge_car" >= 0),
	CONSTRAINT "company_toll_booth_charges_charge_presence_check" CHECK ("charge_per_axle" is not null or "charge_car" is not null)
);
--> statement-breakpoint
ALTER TABLE "company_toll_booth_charges" ADD CONSTRAINT "company_toll_booth_charges_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "company_toll_booth_charges" ADD CONSTRAINT "company_toll_booth_charges_osm_node_id_toll_booths_osm_node_id_fk" FOREIGN KEY ("osm_node_id") REFERENCES "toll_booths"("osm_node_id") ON DELETE RESTRICT ON UPDATE CASCADE;
