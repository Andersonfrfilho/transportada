CREATE TABLE "trip_document_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"trip_document_id" uuid NOT NULL,
	"product_code" text NOT NULL DEFAULT '',
	"stage" text NOT NULL,
	"type" text NOT NULL,
	"note" text NOT NULL DEFAULT '',
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "trip_document_occurrences"
	ADD CONSTRAINT "trip_document_occurrences_company_id_companies_id_fk"
	FOREIGN KEY ("company_id") REFERENCES "companies"("id")
	ON DELETE restrict ON UPDATE cascade;

ALTER TABLE "trip_document_occurrences"
	ADD CONSTRAINT "trip_document_occurrences_company_document_fk"
	FOREIGN KEY ("company_id", "trip_document_id") REFERENCES "trip_documents"("company_id", "id")
	ON DELETE cascade ON UPDATE cascade;

ALTER TABLE "trip_document_occurrences"
	ADD CONSTRAINT "trip_document_occurrences_stage_check"
	CHECK ("stage" IN ('delivery', 'separation'));

ALTER TABLE "trip_document_occurrences"
	ADD CONSTRAINT "trip_document_occurrences_type_check"
	CHECK ("type" IN ('item_faltante', 'item_avariado', 'divergencia_quantidade', 'recusa_total', 'recusa_parcial', 'avaria_transporte', 'destinatario_ausente'));

CREATE INDEX "trip_document_occurrences_company_document_idx"
	ON "trip_document_occurrences" ("company_id", "trip_document_id", "created_at");

COMMENT ON TABLE "trip_document_occurrences" IS
	'O que houve com um item da carga (spec 079 T020). Append-only por desenho, como audit_logs: ocorrencia registrada e o que aconteceu, e o que aconteceu nao se edita. Ela SO ANOTA - nao bloqueia transicao e nao muda separation_status, porque misturar o estado da nota com o que houve com ela deixaria o operador sem saida, ja que nao existe tela de resolucao de ocorrencia.';

COMMENT ON COLUMN "trip_document_occurrences"."product_code" IS
	'O codigo do item em nfe_products. Vazio quando a ocorrencia e da nota inteira - recusa total nao tem item.';

COMMENT ON COLUMN "trip_document_occurrences"."stage" IS
	'separation acontece no galpao e e trip.manage; delivery acontece na rua e e trip.report. E a mesma linha que a ADR-0043 tracou entre barracao e rua.';
