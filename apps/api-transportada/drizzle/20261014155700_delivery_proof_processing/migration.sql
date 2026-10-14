CREATE TABLE "delivery_proof_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"event_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"proof_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"event_version" bigint DEFAULT 1 NOT NULL,
	"correlation_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempt" bigint DEFAULT 0 NOT NULL,
	"claim_owner" text,
	"claim_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_proof_outbox_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "delivery_proof_outbox_company_id_event_id_unique" UNIQUE("company_id","event_id"),
	CONSTRAINT "delivery_proof_outbox_event_type_check" CHECK ("event_type" in ('delivery-proof.processing.requested'))
);
--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "processing_state" varchar(32);--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "original_object_id" uuid;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "processing_error" varchar(64);--> statement-breakpoint
CREATE INDEX "trip_delivery_proofs_company_original_idx" ON "trip_delivery_proofs" ("company_id","original_object_id") WHERE "original_object_id" is not null;--> statement-breakpoint
CREATE INDEX "delivery_proof_outbox_company_pub_next_attempt_created_idx" ON "delivery_proof_outbox" ("company_id","published_at","next_attempt_at","created_at");--> statement-breakpoint
CREATE INDEX "delivery_proof_outbox_company_proof_idx" ON "delivery_proof_outbox" ("company_id","proof_id");--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_company_original_fk" FOREIGN KEY ("company_id","original_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "delivery_proof_outbox" ADD CONSTRAINT "delivery_proof_outbox_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "delivery_proof_outbox" ADD CONSTRAINT "delivery_proof_outbox_company_proof_fk" FOREIGN KEY ("company_id","proof_id") REFERENCES "trip_delivery_proofs"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_processing_state_check" CHECK ("processing_state" is null or "processing_state" in ('received', 'processing', 'ready', 'processing_failed'));