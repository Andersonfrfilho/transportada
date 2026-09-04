CREATE TABLE "company_cargo_volume_factors" (
	"company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE restrict ON UPDATE cascade,
	"species" text NOT NULL DEFAULT '',
	"volume_per_unit_m3" numeric(12,6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_cargo_volume_factors_pkey" PRIMARY KEY ("company_id", "species"),
	CONSTRAINT "company_cargo_volume_factors_volume_check" CHECK ("volume_per_unit_m3" > 0)
);

COMMENT ON TABLE "company_cargo_volume_factors" IS
	'Fator de cubagem por espécie de volume da NF-e (spec 075). A linha de espécie vazia é o padrão: medido em 2026-09-02, species está vazio em 1808 de 1808 volumes em produção, então ela atende todo o dado de hoje.';

COMMENT ON COLUMN "company_cargo_volume_factors"."volume_per_unit_m3" IS
	'Metros cúbicos por volume. O CHECK recusa zero e negativo: ausência de estimativa é a ausência da linha, nunca zero — zero declararia que a carga não ocupa espaço (ADR-0052, mesma decisão para massa).';
