CREATE TABLE "address_correction_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"contractor_id" uuid NOT NULL,
	"address_key" varchar(255) NOT NULL,
	"reported_street" varchar(255) NOT NULL,
	"reported_number" varchar(20) NOT NULL,
	"reported_complement" varchar(255),
	"reported_district" varchar(255),
	"reported_city_code" varchar(7) NOT NULL,
	"reported_city" varchar(255) NOT NULL,
	"reported_state" varchar(2) NOT NULL,
	"reported_postal_code" varchar(8) NOT NULL,
	"proposed_street" varchar(255) NOT NULL,
	"proposed_number" varchar(20) NOT NULL,
	"proposed_complement" varchar(255),
	"proposed_district" varchar(255),
	"proposed_city_code" varchar(7) NOT NULL,
	"proposed_city" varchar(255) NOT NULL,
	"proposed_state" varchar(2) NOT NULL,
	"proposed_postal_code" varchar(8) NOT NULL,
	"reason_match_level" varchar(32) NOT NULL,
	"reason_distance_metres" numeric(12,2),
	"recipient_name" varchar(255),
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"thread_id" uuid,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "address_correction_requests_status_check" CHECK ("status" in ('draft', 'sent')),
	CONSTRAINT "address_correction_requests_distance_check" CHECK ("reason_distance_metres" is null or "reason_distance_metres" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "address_correction_requests_company_address_draft_unique" ON "address_correction_requests" ("company_id","address_key") WHERE "status" = 'draft';--> statement-breakpoint
CREATE INDEX "address_correction_requests_company_contractor_status_idx" ON "address_correction_requests" ("company_id","contractor_id","status");--> statement-breakpoint
ALTER TABLE "address_correction_requests" ADD CONSTRAINT "address_correction_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "address_correction_requests" ADD CONSTRAINT "address_correction_requests_contractor_fk" FOREIGN KEY ("company_id","contractor_id") REFERENCES "contractors"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "address_correction_requests" ADD CONSTRAINT "address_correction_requests_thread_fk" FOREIGN KEY ("company_id","thread_id") REFERENCES "contractor_mail_threads"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_mail_threads" DROP CONSTRAINT "contractor_mail_threads_subject_type_check", ADD CONSTRAINT "contractor_mail_threads_subject_type_check" CHECK ("subject_type" in ('stop_occurrence', 'document_occurrence', 'delivery_charge', 'setup_test', 'address_correction'));