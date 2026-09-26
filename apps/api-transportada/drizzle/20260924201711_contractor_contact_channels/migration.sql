ALTER TABLE "contractor_contacts" ADD COLUMN "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "contractor_contacts" ADD COLUMN "role_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "contractor_contacts" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "contractor_contacts" ADD COLUMN "types" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "contractor_contacts" ADD COLUMN "occurrence_stages" text[] DEFAULT '{separation,delivery,stop}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "contractor_contacts" ADD COLUMN "whatsapp_opt_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contractor_contacts" ADD COLUMN "whatsapp_opt_in_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "contractor_contacts" ADD COLUMN "preferred_channel" text DEFAULT 'email' NOT NULL;--> statement-breakpoint
CREATE INDEX "contractor_contacts_company_phone_idx" ON "contractor_contacts" ("company_id","phone");--> statement-breakpoint
ALTER TABLE "contractor_contacts" ADD CONSTRAINT "contractor_contacts_whatsapp_opt_in_by_user_fk" FOREIGN KEY ("whatsapp_opt_in_by_user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_contacts" ADD CONSTRAINT "contractor_contacts_types_check" CHECK ("types" <@ array['occurrences', 'approves_charges', 'scheduling', 'invoices', 'cte_xml']::text[]);--> statement-breakpoint
ALTER TABLE "contractor_contacts" ADD CONSTRAINT "contractor_contacts_occurrence_stages_check" CHECK ("occurrence_stages" <@ array['separation', 'delivery', 'stop']::text[]);--> statement-breakpoint
ALTER TABLE "contractor_contacts" ADD CONSTRAINT "contractor_contacts_preferred_channel_check" CHECK ("preferred_channel" in ('email', 'whatsapp'));--> statement-breakpoint
ALTER TABLE "contractor_contacts" ADD CONSTRAINT "contractor_contacts_phone_check" CHECK ("phone" is null or "phone" ~ '^55[1-9][0-9]{9,10}$');--> statement-breakpoint
ALTER TABLE "contractor_contacts" ADD CONSTRAINT "contractor_contacts_whatsapp_opt_in_pair_check" CHECK (("whatsapp_opt_in_at" is null) = ("whatsapp_opt_in_by_user_id" is null));--> statement-breakpoint
ALTER TABLE "contractor_contacts" ADD CONSTRAINT "contractor_contacts_whatsapp_opt_in_phone_check" CHECK ("whatsapp_opt_in_at" is null or "phone" is not null);--> statement-breakpoint
ALTER TABLE "contractor_contacts" ADD CONSTRAINT "contractor_contacts_preferred_whatsapp_check" CHECK ("preferred_channel" <> 'whatsapp' or "whatsapp_opt_in_at" is not null);--> statement-breakpoint
-- Spec 183 T301 (RF5): os tipos nascem dos dois campos antigos; nenhum dado existente muda de sentido.
UPDATE "contractor_contacts" SET "types" = array_remove(ARRAY[CASE WHEN "receives_occurrences" THEN 'occurrences' END, CASE WHEN "can_decide" THEN 'approves_charges' END]::text[], NULL);
