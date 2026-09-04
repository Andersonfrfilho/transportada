-- A comparacao entre o que a nota diz e o que o provedor devolveu (spec 084, P1 e RF8).
--
-- Ela guarda a MEDICAO, nao a coordenada do provedor: quais campos divergem, a distancia e o nivel
-- de acerto sao conta nossa, sem licenca de ninguem pendurada. A coordenada deles fica de fora ate
-- o D3 ser respondido, e entra como coluna nova se for liberado.
--
-- O texto devolvido e a excecao, e esta aqui de proposito: e o que permite o relatorio dizer
-- "seria Rua Americo de Araujo Pires?" em vez de "esta errado, descubra". Datado e purgavel sem
-- perder a medicao.
--
-- MEDIDO em 2026-09-04 com a chave real: sao QUATRO niveis, nao dois. `range_interpolated` e a rua
-- certa com numero estimado, e nunca pode ser tratado como `rooftop`.
CREATE TABLE "address_comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"address_key" text NOT NULL,
	"note_street" text NOT NULL DEFAULT '',
	"note_number" text NOT NULL DEFAULT '',
	"note_district" text NOT NULL DEFAULT '',
	"note_postal_code" text NOT NULL DEFAULT '',
	"provider_street" text NOT NULL DEFAULT '',
	"provider_number" text NOT NULL DEFAULT '',
	"provider_district" text NOT NULL DEFAULT '',
	"provider_postal_code" text NOT NULL DEFAULT '',
	"provider_place_id" text NOT NULL DEFAULT '',
	"match_level" text NOT NULL,
	"street_diverges" boolean NOT NULL,
	"district_diverges" boolean NOT NULL,
	"postal_code_diverges" boolean NOT NULL,
	"distance_metres" numeric(12, 2),
	"city_mismatch" boolean NOT NULL DEFAULT false,
	"compared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "address_comparisons"
	ADD CONSTRAINT "address_comparisons_company_id_companies_id_fk"
	FOREIGN KEY ("company_id") REFERENCES "companies"("id")
	ON DELETE restrict ON UPDATE cascade;

ALTER TABLE "address_comparisons"
	ADD CONSTRAINT "address_comparisons_address_key_check" CHECK (length("address_key") > 0);

ALTER TABLE "address_comparisons"
	ADD CONSTRAINT "address_comparisons_match_level_check"
	CHECK ("match_level" IN ('rooftop', 'range_interpolated', 'approximate', 'not_found'));

ALTER TABLE "address_comparisons"
	ADD CONSTRAINT "address_comparisons_distance_check"
	CHECK ("distance_metres" IS NULL OR "distance_metres" >= 0);

-- Municipio divergente DESCARTA o resultado, entao nao pode vir acompanhado de comparacao de campo:
-- comparar rua de outra cidade e comparar outra coisa.
ALTER TABLE "address_comparisons"
	ADD CONSTRAINT "address_comparisons_city_mismatch_check"
	CHECK (NOT "city_mismatch" OR (NOT "street_diverges" AND NOT "district_diverges" AND NOT "postal_code_diverges"));

CREATE INDEX "address_comparisons_company_compared_idx"
	ON "address_comparisons" ("company_id", "compared_at");
CREATE INDEX "address_comparisons_address_key_idx"
	ON "address_comparisons" ("address_key");
-- O relatorio ordena por gravidade: quem nem foi achado primeiro.
CREATE INDEX "address_comparisons_match_level_idx"
	ON "address_comparisons" ("company_id", "match_level");
