CREATE TABLE "delivery_proof_setting_contractor_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"contractor_id" uuid NOT NULL,
	"receiver_name" text DEFAULT 'optional' NOT NULL,
	"receiver_document" text DEFAULT 'off' NOT NULL,
	"signature" text DEFAULT 'optional' NOT NULL,
	"photo" text DEFAULT 'optional' NOT NULL,
	"received_by" text DEFAULT 'optional' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_proof_setting_contractor_overrides_company_contractor_unique" UNIQUE("company_id","contractor_id"),
	CONSTRAINT "delivery_proof_setting_contractor_overrides_receiver_name_check" CHECK ("receiver_name" in ('required', 'optional', 'off')),
	CONSTRAINT "delivery_proof_setting_contractor_overrides_receiver_document_check" CHECK ("receiver_document" in ('required', 'optional', 'off')),
	CONSTRAINT "delivery_proof_setting_contractor_overrides_signature_check" CHECK ("signature" in ('required', 'optional', 'off')),
	CONSTRAINT "delivery_proof_setting_contractor_overrides_photo_check" CHECK ("photo" in ('required', 'optional', 'off')),
	CONSTRAINT "delivery_proof_setting_contractor_overrides_received_by_check" CHECK ("received_by" in ('required', 'optional', 'off'))
);
--> statement-breakpoint
ALTER TABLE "delivery_proof_setting_contractor_overrides" ADD CONSTRAINT "delivery_proof_setting_contractor_overrides_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "delivery_proof_setting_contractor_overrides" ADD CONSTRAINT "delivery_proof_setting_contractor_overrides_company_id_contractor_id_contractors_company_id_id_fk" FOREIGN KEY ("company_id","contractor_id") REFERENCES "contractors"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
-- Spec 218 RF-C2: backfill antes da FK — todo override "órfão" (sem `delivery_clients`
-- correspondente) ganha uma linha nova aqui, para a constraint abaixo nunca quebrar uma exceção
-- já configurada. `display_name` vazio e `status: active` são os mesmos valores de um cadastro
-- automático comum (ADR-0048); os campos operacionais restantes seguem o padrão da coluna.
INSERT INTO "delivery_clients" ("company_id", "tax_id", "display_name", "status")
SELECT DISTINCT o."company_id", o."tax_id", '', 'active'
FROM "delivery_proof_setting_overrides" o
WHERE NOT EXISTS (
  SELECT 1 FROM "delivery_clients" c
  WHERE c."company_id" = o."company_id" AND c."tax_id" = o."tax_id"
)
ON CONFLICT ("company_id", "tax_id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "delivery_proof_setting_overrides" ADD CONSTRAINT "delivery_proof_setting_overrides_company_id_tax_id_delivery_clients_company_id_tax_id_fk" FOREIGN KEY ("company_id","tax_id") REFERENCES "delivery_clients"("company_id","tax_id") ON DELETE RESTRICT ON UPDATE CASCADE;