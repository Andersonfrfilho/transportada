ALTER TABLE "fleet_vehicles"
	ADD COLUMN "cargo_length_m" numeric(8,3) NOT NULL DEFAULT '0',
	ADD COLUMN "cargo_width_m" numeric(8,3) NOT NULL DEFAULT '0',
	ADD COLUMN "cargo_height_m" numeric(8,3) NOT NULL DEFAULT '0';

ALTER TABLE "fleet_vehicles"
	ADD CONSTRAINT "fleet_vehicles_cargo_dimensions_check"
	CHECK ("cargo_length_m" >= 0 AND "cargo_width_m" >= 0 AND "cargo_height_m" >= 0);

COMMENT ON COLUMN "fleet_vehicles"."cargo_length_m" IS
	'Comprimento interno do baú. A dimensão é o dado primitivo e o m3 é derivado dela (spec 075 D2): o m3 publicado por aí erra contra as proprias medidas, e a dispersao por tipo chega a 2x.';

CREATE TABLE "vehicle_volume_references" (
	"vehicle_type" text NOT NULL,
	"body_type" char(2) NOT NULL,
	"cargo_length_m" numeric(8,3) NOT NULL,
	"cargo_width_m" numeric(8,3) NOT NULL,
	"cargo_height_m" numeric(8,3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_volume_references_pkey" PRIMARY KEY ("vehicle_type", "body_type"),
	CONSTRAINT "vehicle_volume_references_dimensions_check"
		CHECK ("cargo_length_m" > 0 AND "cargo_width_m" > 0 AND "cargo_height_m" > 0)
);

COMMENT ON TABLE "vehicle_volume_references" IS
	'Referencia de cubagem por tipo, SEM company_id: e catalogo de mercado, como fuel_price_references. A chave e (vehicle_type, body_type) porque carreta e o IMPLEMENTO — e implemento tem vehicle_type vazio, o tipo e de quem traciona (spec 075 D2b).';

INSERT INTO "vehicle_volume_references"
	("vehicle_type", "body_type", "cargo_length_m", "cargo_width_m", "cargo_height_m")
VALUES
	('utility', '02', 1.700, 1.300, 1.400),
	('van',     '02', 3.200, 1.650, 1.900),
	('vuc',     '02', 3.150, 1.900, 2.200),
	('toco',    '02', 7.000, 2.500, 2.400),
	('truck',   '02', 8.900, 2.500, 2.400),
	('',        '02', 14.270, 2.460, 2.700),
	('',        '05', 14.270, 2.460, 2.700);
