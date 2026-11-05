-- Spec 091 T008: o documento do motorista (CNH etc.) na ficha da frota. Aditiva: tabela nova e purpose novo no CHECK de `stored_objects` (conjunto maior).
CREATE TABLE "fleet_driver_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"type" text NOT NULL,
	"stored_object_id" uuid NOT NULL,
	"extracted_fields" jsonb,
	"extracted_at" timestamp with time zone,
	"decision" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fleet_driver_attachments_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "fleet_driver_attachments_type_check" CHECK ("type" in ('cnh', 'address_proof', 'identity_document', 'other')),
	CONSTRAINT "fleet_driver_attachments_decision_check" CHECK ("decision" is null or "decision" in ('accepted', 'dismissed')),
	CONSTRAINT "fleet_driver_attachments_decision_complete_check" CHECK (("decision" is null) = ("decided_at" is null) and ("decision" is null) = ("decided_by" is null)),
	CONSTRAINT "fleet_driver_attachments_decided_without_fields_check" CHECK ("decision" is null or "extracted_fields" is null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "fleet_driver_attachments_company_driver_type_unique" ON "fleet_driver_attachments" ("company_id","driver_id","type") WHERE "type" <> 'other';--> statement-breakpoint
ALTER TABLE "fleet_driver_attachments" ADD CONSTRAINT "fleet_driver_attachments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "fleet_driver_attachments" ADD CONSTRAINT "fleet_driver_attachments_company_driver_fk" FOREIGN KEY ("company_id","driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "fleet_driver_attachments" ADD CONSTRAINT "fleet_driver_attachments_company_stored_object_fk" FOREIGN KEY ("company_id","stored_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "stored_objects" DROP CONSTRAINT "stored_objects_purpose_check", ADD CONSTRAINT "stored_objects_purpose_check" CHECK ("purpose" in ('import_source', 'nfe_document', 'nfe_event', 'billing_document', 'cte_document', 'mdfe_document', 'nfse_document', 'aggregate_document', 'delivery_proof', 'aggregate_application_attachment', 'contractor_mail_raw', 'trip_occurrence_attachment', 'trip_occurrence_thumbnail', 'extra_charge_batch_statement', 'occurrence_conversation_attachment', 'trip_delivery_proof_thumbnail', 'fleet_driver_attachment'));