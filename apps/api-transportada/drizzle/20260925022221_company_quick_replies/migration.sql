CREATE TABLE "company_quick_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"audience" text NOT NULL,
	"body_text" text NOT NULL,
	"position" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_quick_replies_audience_check" CHECK ("audience" in ('contractor', 'driver')),
	CONSTRAINT "company_quick_replies_body_text_check" CHECK (char_length(btrim("body_text")) between 1 and 500),
	CONSTRAINT "company_quick_replies_position_check" CHECK ("position" >= 0)
);
--> statement-breakpoint
CREATE INDEX "company_quick_replies_audience_position_idx" ON "company_quick_replies" ("company_id","audience","position");--> statement-breakpoint
ALTER TABLE "company_quick_replies" ADD CONSTRAINT "company_quick_replies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;