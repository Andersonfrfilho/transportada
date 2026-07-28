CREATE TABLE "mdfe_processed_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"consumer_name" text NOT NULL,
	"event_id" uuid NOT NULL,
	"manifest_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"result" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mdfe_processed_messages_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "mdfe_processed_messages_company_consumer_event_unique" UNIQUE("company_id","consumer_name","event_id")
);
--> statement-breakpoint
ALTER TABLE "mdfe_processed_messages" ADD CONSTRAINT "mdfe_processed_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;