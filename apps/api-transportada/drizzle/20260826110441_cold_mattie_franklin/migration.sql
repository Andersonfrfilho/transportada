CREATE TABLE "trip_delivery_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"stop_event_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"object_id" uuid NOT NULL,
	"receiver_name" text DEFAULT '' NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_delivery_proofs_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "trip_delivery_proofs_company_event_kind_unique" UNIQUE("company_id","stop_event_id","kind"),
	CONSTRAINT "trip_delivery_proofs_kind_check" CHECK ("kind" in ('photo', 'signature')),
	CONSTRAINT "trip_delivery_proofs_receiver_check" CHECK ("kind" = 'signature' or length("receiver_name") = 0)
);
--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_company_event_fk" FOREIGN KEY ("company_id","stop_event_id") REFERENCES "trip_stop_events"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_company_object_fk" FOREIGN KEY ("company_id","object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "stored_objects" DROP CONSTRAINT "stored_objects_purpose_check", ADD CONSTRAINT "stored_objects_purpose_check" CHECK ("purpose" in ('import_source', 'nfe_document', 'nfe_event', 'billing_document', 'cte_document', 'mdfe_document', 'nfse_document', 'aggregate_document', 'delivery_proof'));