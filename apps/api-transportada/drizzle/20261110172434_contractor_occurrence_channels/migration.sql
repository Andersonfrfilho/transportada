-- Spec 318 T2: canal do aviso de ocorrencia por contratante (email | whatsapp_group). Aditiva: tabela nova, sem backfill; sem linha a contratante segue por e-mail.
CREATE TABLE "contractor_occurrence_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"contractor_id" uuid NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"group_jid" text,
	"group_name" text DEFAULT '' NOT NULL,
	"mention_phone" text,
	"email_fallback" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractor_occurrence_channels_company_contractor_unique" UNIQUE("company_id","contractor_id"),
	CONSTRAINT "contractor_occurrence_channels_company_group_unique" UNIQUE("company_id","group_jid"),
	CONSTRAINT "contractor_occurrence_channels_channel_check" CHECK ("channel" in ('email', 'whatsapp_group')),
	CONSTRAINT "contractor_occurrence_channels_group_jid_check" CHECK ("group_jid" is null or "group_jid" ~ '^[0-9]+(-[0-9]+)?@g\.us$'),
	CONSTRAINT "contractor_occurrence_channels_mention_phone_check" CHECK ("mention_phone" is null or "mention_phone" ~ '^55[1-9][0-9]{9,10}$'),
	CONSTRAINT "contractor_occurrence_channels_group_complete_check" CHECK ("channel" <> 'whatsapp_group' or ("group_jid" is not null and "mention_phone" is not null))
);
--> statement-breakpoint
ALTER TABLE "contractor_occurrence_channels" ADD CONSTRAINT "contractor_occurrence_channels_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_occurrence_channels" ADD CONSTRAINT "contractor_occurrence_channels_company_contractor_fk" FOREIGN KEY ("company_id","contractor_id") REFERENCES "contractors"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;