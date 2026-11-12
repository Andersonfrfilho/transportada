-- Spec 285: a automacao do fluxo semanal de um contratante (interruptor, prazo da fatura, tipo de XML, partes, destinatarios).
-- Aditiva: tabela nova, nenhuma linha existente muda.
CREATE TABLE "contractor_automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"billing_due_days" integer DEFAULT 15 NOT NULL,
	"xml_kind" text DEFAULT 'cte' NOT NULL,
	"part_size" integer DEFAULT 100 NOT NULL,
	"recipients" text[] DEFAULT '{}'::text[] NOT NULL,
	"nfse_city" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid,
	CONSTRAINT "contractor_automations_company_name_unique" UNIQUE("company_id","name"),
	CONSTRAINT "contractor_automations_name_check" CHECK (length(btrim("name")) between 1 and 120),
	CONSTRAINT "contractor_automations_billing_due_days_check" CHECK ("billing_due_days" between 1 and 120),
	CONSTRAINT "contractor_automations_xml_kind_check" CHECK ("xml_kind" in ('cte')),
	CONSTRAINT "contractor_automations_part_size_check" CHECK ("part_size" between 1 and 100),
	CONSTRAINT "contractor_automations_recipients_check" CHECK (cardinality("recipients") <= 50)
);
--> statement-breakpoint
ALTER TABLE "contractor_automations" ADD CONSTRAINT "contractor_automations_company_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;