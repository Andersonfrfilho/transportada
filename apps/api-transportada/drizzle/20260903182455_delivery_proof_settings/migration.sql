-- Spec 082 / ADR-0057: a configuracao do comprovante e por empresa, com excecao por CNPJ do
-- destinatario, e o documento do recebedor entra selado (envelope A256GCM) com mascara ao lado.
-- Migration aditiva: nenhuma coluna ou tabela existente muda.
CREATE TABLE "company_delivery_proof_settings" (
	"company_id" uuid PRIMARY KEY,
	"receiver_name" text DEFAULT 'optional' NOT NULL,
	"receiver_document" text DEFAULT 'off' NOT NULL,
	"signature" text DEFAULT 'optional' NOT NULL,
	"photo" text DEFAULT 'optional' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_delivery_proof_settings_receiver_name_check" CHECK ("receiver_name" in ('required', 'optional', 'off')),
	CONSTRAINT "company_delivery_proof_settings_receiver_document_check" CHECK ("receiver_document" in ('required', 'optional', 'off')),
	CONSTRAINT "company_delivery_proof_settings_signature_check" CHECK ("signature" in ('required', 'optional', 'off')),
	CONSTRAINT "company_delivery_proof_settings_photo_check" CHECK ("photo" in ('required', 'optional', 'off'))
);
--> statement-breakpoint
CREATE TABLE "delivery_proof_setting_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"tax_id" text NOT NULL,
	"receiver_name" text DEFAULT 'optional' NOT NULL,
	"receiver_document" text DEFAULT 'off' NOT NULL,
	"signature" text DEFAULT 'optional' NOT NULL,
	"photo" text DEFAULT 'optional' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_proof_setting_overrides_company_tax_id_unique" UNIQUE("company_id","tax_id"),
	CONSTRAINT "delivery_proof_setting_overrides_tax_id_check" CHECK ("tax_id" ~ '^[0-9]{11}$|^[A-Z0-9]{12}[0-9]{2}$'),
	CONSTRAINT "delivery_proof_setting_overrides_receiver_name_check" CHECK ("receiver_name" in ('required', 'optional', 'off')),
	CONSTRAINT "delivery_proof_setting_overrides_receiver_document_check" CHECK ("receiver_document" in ('required', 'optional', 'off')),
	CONSTRAINT "delivery_proof_setting_overrides_signature_check" CHECK ("signature" in ('required', 'optional', 'off')),
	CONSTRAINT "delivery_proof_setting_overrides_photo_check" CHECK ("photo" in ('required', 'optional', 'off'))
);
--> statement-breakpoint
ALTER TABLE "company_delivery_proof_settings" ADD CONSTRAINT "company_delivery_proof_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "delivery_proof_setting_overrides" ADD CONSTRAINT "delivery_proof_setting_overrides_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "receiver_document_envelope" jsonb;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "receiver_document_masked" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_receiver_document_check" CHECK (("kind" = 'signature' or "receiver_document_envelope" is null) and (("receiver_document_envelope" is null) = (length("receiver_document_masked") = 0)));--> statement-breakpoint
COMMENT ON TABLE "company_delivery_proof_settings" IS
	'ADR-0057: o estado de cada campo do comprovante (required/optional/off), por empresa. Ausencia de linha e o padrao de fabrica: receiver_document off, o resto optional.';--> statement-breakpoint
COMMENT ON TABLE "delivery_proof_setting_overrides" IS
	'ADR-0057: a excecao por CNPJ do destinatario. A linha vence a configuracao geral por inteiro.';--> statement-breakpoint
COMMENT ON COLUMN "trip_delivery_proofs"."receiver_document_envelope" IS
	'Envelope A256GCM com AAD transportada:delivery-proof:v1:{companyId}:{proofId}. O valor em claro nao tem coluna e nao vai para log.';--> statement-breakpoint
COMMENT ON COLUMN "trip_delivery_proofs"."receiver_document_masked" IS
	'A forma que toda leitura devolve (***.938.570-**). Vazia quando a empresa nao colhe documento.';
