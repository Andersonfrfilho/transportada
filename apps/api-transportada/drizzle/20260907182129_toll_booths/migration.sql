-- A praça de pedágio mapeada no OSM, com a tarifa que ela cobra (spec 090 T1).
--
-- ⚠️ Sem `company_id`, de propósito: é a terceira tabela do produto nessa condição, ao lado de
-- `fuel_price_references` e `vehicle_volume_references`. Tarifa pública, idêntica para toda
-- instalação, sem PII e sem efeito fiscal. A exceção é assertada por extenso em
-- `test/fleet-schema/tenant-safety.contract.ts`.
--
-- ⚠️ `osm_node_id` é a chave natural, e é ela que torna o seed idempotente: a praça **é** um nó do
-- OSM, e é por identidade de nó que a rota a encontra — nunca por proximidade.
--
-- Tarifa nula é desconhecida, não gratuita: praça sem `charge` no mapa entra assim mesmo, porque
-- ela existe na estrada e descartá-la faria a rota parecer sem pedágio.
CREATE TABLE "toll_booths" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"osm_node_id" bigint NOT NULL,
	"name" text,
	"operator" text,
	"latitude" numeric(10,7) NOT NULL,
	"longitude" numeric(10,7) NOT NULL,
	"charge_per_axle" numeric(19,4),
	"charge_car" numeric(19,4),
	"observed_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "toll_booths_osm_node_id_unique" UNIQUE("osm_node_id"),
	CONSTRAINT "toll_booths_osm_node_id_check" CHECK ("osm_node_id" > 0),
	CONSTRAINT "toll_booths_latitude_check" CHECK ("latitude" between -90 and 90),
	CONSTRAINT "toll_booths_longitude_check" CHECK ("longitude" between -180 and 180),
	CONSTRAINT "toll_booths_charge_per_axle_check" CHECK ("charge_per_axle" is null or "charge_per_axle" >= 0),
	CONSTRAINT "toll_booths_charge_car_check" CHECK ("charge_car" is null or "charge_car" >= 0)
);
