-- O tipo de ocorrencia deixa de ser catalogo fechado do produto e passa a ser cadastro da empresa.
--
-- MEDIDO EM 2026-09-03: trip_document_occurrences e company_occurrence_notification_settings tinham
-- ZERO linhas nos dois ambientes, e producao tinha ZERO viagens. Por isso a coluna `type` vira FK
-- sem migracao de dado: nao ha linha para converter.
CREATE TABLE "company_occurrence_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"stage" text NOT NULL,
	"notifies" boolean NOT NULL DEFAULT false,
	"active" boolean NOT NULL DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "company_occurrence_types"
	ADD CONSTRAINT "company_occurrence_types_company_id_companies_id_fk"
	FOREIGN KEY ("company_id") REFERENCES "companies"("id")
	ON DELETE restrict ON UPDATE cascade;

ALTER TABLE "company_occurrence_types"
	ADD CONSTRAINT "company_occurrence_types_stage_check"
	CHECK ("stage" IN ('delivery', 'separation'));

ALTER TABLE "company_occurrence_types"
	ADD CONSTRAINT "company_occurrence_types_name_check"
	CHECK (length(btrim("name")) > 0);

-- O nome e unico por empresa: dois tipos com o mesmo nome viram duas estatisticas do mesmo fato.
CREATE UNIQUE INDEX "company_occurrence_types_company_name_unique"
	ON "company_occurrence_types" ("company_id", lower(btrim("name")));

ALTER TABLE "company_occurrence_types"
	ADD CONSTRAINT "company_occurrence_types_company_id_id_unique" UNIQUE ("company_id", "id");

COMMENT ON TABLE "company_occurrence_types" IS
	'Os tipos de ocorrencia que a empresa cadastrou (spec 079). O stage decide QUEM registra - separation e do galpao (trip.manage) e delivery e da rua (trip.report) -, e por isso ele e escolhido no cadastro: sem ele nao ha como derivar a permissao. `active` aposenta o tipo sem apagar historico; apagar deixaria ocorrencia orfa.';

COMMENT ON COLUMN "company_occurrence_types"."notifies" IS
	'A flag de aviso mora aqui, no proprio tipo, e nao numa tabela ao lado: eram a mesma decisao chaveada pelo mesmo valor, e separa-las obrigava a tela a casar duas listas.';

-- A ocorrencia aponta para o tipo cadastrado.
ALTER TABLE "trip_document_occurrences"
	DROP CONSTRAINT "trip_document_occurrences_type_check";

ALTER TABLE "trip_document_occurrences"
	DROP COLUMN "type";

ALTER TABLE "trip_document_occurrences"
	ADD COLUMN "occurrence_type_id" uuid NOT NULL;

ALTER TABLE "trip_document_occurrences"
	ADD CONSTRAINT "trip_document_occurrences_company_type_fk"
	FOREIGN KEY ("company_id", "occurrence_type_id")
	REFERENCES "company_occurrence_types"("company_id", "id")
	ON DELETE restrict ON UPDATE cascade;

COMMENT ON COLUMN "trip_document_occurrences"."product_code" IS
	'O item da nota a que a ocorrencia se refere. VAZIO E A NOTA INTEIRA - e o caso de recusa total, em que nao ha item a apontar. Guardar o codigo, e nao o id da linha de nfe_products, e o que faz a ocorrencia sobreviver a uma reimportacao da nota.';

-- A tabela de flag por tipo deixa de existir: a flag virou coluna do proprio tipo.
DROP TABLE IF EXISTS "company_occurrence_notification_settings";
