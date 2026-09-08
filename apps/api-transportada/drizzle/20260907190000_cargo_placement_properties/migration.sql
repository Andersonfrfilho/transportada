-- As propriedades que decidem ONDE a caixa pode ir, e os eixos que decidem se ela pode sair assim
-- (spec 094).
--
-- ⚠️ Tudo **nulo por padrão**, e nulo é "ninguém informou" — nunca "pode". A diferença aparece no
-- desenho: com `is_stackable` nulo a planta empilha e marca o arranjo como presumido; com `false`
-- ela não empilha e não marca, porque a restrição é conhecida. Tratar ausência como permissão
-- apagaria a distinção entre uma carga que alguém conferiu e uma que ninguém olhou.
--
-- ⚠️ Nada disto é obrigatório para a planta existir. Enquanto os campos não estiverem preenchidos a
-- tela **apenas posiciona**, dizendo o que não conferiu. Exigir o cadastro antes de desenhar
-- deixaria a tela vazia para a frota inteira de hoje — que tem zero eixos declarados e 6 caixas
-- medidas de 663.
ALTER TABLE "nfe_package_boxes"
	ADD COLUMN IF NOT EXISTS "is_stackable" boolean,
	ADD COLUMN IF NOT EXISTS "max_stack_count" integer,
	ADD COLUMN IF NOT EXISTS "is_fragile" boolean,
	ADD COLUMN IF NOT EXISTS "keep_upright" boolean;

-- Pilha de zero não existe, e pilha declarada em caixa que não empilha é contradição — a primeira
-- coisa que alguém digita errado num formulário com quatro campos novos.
ALTER TABLE "nfe_package_boxes"
	DROP CONSTRAINT IF EXISTS "nfe_package_boxes_stack_check";

ALTER TABLE "nfe_package_boxes"
	ADD CONSTRAINT "nfe_package_boxes_stack_check"
	CHECK (
		("max_stack_count" IS NULL OR "max_stack_count" > 0)
		AND ("max_stack_count" IS NULL OR "is_stackable" IS NOT FALSE)
	);

COMMENT ON COLUMN "nfe_package_boxes"."is_stackable" IS
	'Se aceita peso em cima. Nulo é "não informado": a planta empilha e marca o arranjo como presumido (spec 094).';
COMMENT ON COLUMN "nfe_package_boxes"."keep_upright" IS
	'"Este lado para cima": impede deitar a caixa para caber melhor.';

-- Os eixos, com posição e limite. ⚠️ TABELA, não coluna: um `max_axle_load_kg` único responderia
-- "o veículo aguenta X por eixo" e não responde a pergunta que interessa — *este* arranjo
-- sobrecarrega *qual* eixo. Para isso é preciso saber onde cada eixo está em relação ao baú.
CREATE TABLE IF NOT EXISTS "fleet_vehicle_axles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"distance_from_front_m" numeric(6, 3) NOT NULL,
	"max_load_kg" numeric(10, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fleet_vehicle_axles_vehicle_position_unique" UNIQUE("company_id","vehicle_id","position"),
	CONSTRAINT "fleet_vehicle_axles_position_check" CHECK ("position" BETWEEN 1 AND 9),
	CONSTRAINT "fleet_vehicle_axles_distance_check" CHECK ("distance_from_front_m" > 0 AND "distance_from_front_m" <= 30),
	CONSTRAINT "fleet_vehicle_axles_load_check" CHECK ("max_load_kg" IS NULL OR ("max_load_kg" > 0 AND "max_load_kg" <= 30000))
);

ALTER TABLE "fleet_vehicle_axles"
	ADD CONSTRAINT "fleet_vehicle_axles_company_id_companies_id_fk"
	FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
	ON DELETE restrict ON UPDATE cascade;

-- ⚠️ A FK leva o tenant junto: a simples aceitaria amarrar eixo ao veículo de outra empresa.
ALTER TABLE "fleet_vehicle_axles"
	ADD CONSTRAINT "fleet_vehicle_axles_company_vehicle_fk"
	FOREIGN KEY ("company_id","vehicle_id") REFERENCES "public"."fleet_vehicles"("company_id","id")
	ON DELETE cascade ON UPDATE cascade;

CREATE INDEX IF NOT EXISTS "fleet_vehicle_axles_company_vehicle_idx"
	ON "fleet_vehicle_axles" ("company_id","vehicle_id");
