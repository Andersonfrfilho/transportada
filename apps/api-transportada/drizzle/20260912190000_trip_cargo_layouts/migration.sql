CREATE TABLE "trip_cargo_layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"trip_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"input_hash" text NOT NULL,
	"policy_version" text NOT NULL,
	"input" jsonb NOT NULL,
	"layout" jsonb,
	"error_code" text DEFAULT '' NOT NULL,
	"attempt" bigint DEFAULT 0 NOT NULL,
	"duration_ms" bigint,
	"computed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_cargo_layouts_company_input_hash_unique" UNIQUE("company_id","input_hash"),
	CONSTRAINT "trip_cargo_layouts_status_check" CHECK ("status" in ('queued', 'running', 'ready', 'failed')),
	CONSTRAINT "trip_cargo_layouts_layout_check" CHECK (("status" = 'ready') = ("layout" is not null)),
	CONSTRAINT "trip_cargo_layouts_error_code_check" CHECK (("status" = 'failed') = (length("error_code") > 0)),
	CONSTRAINT "trip_cargo_layouts_counters_check" CHECK ("attempt" >= 0 and ("duration_ms" is null or "duration_ms" >= 0))
);
--> statement-breakpoint
ALTER TABLE "trip_cargo_layouts" ADD CONSTRAINT "trip_cargo_layouts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_cargo_layouts" ADD CONSTRAINT "trip_cargo_layouts_company_trip_fk" FOREIGN KEY ("company_id","trip_id") REFERENCES "trips"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
CREATE INDEX "trip_cargo_layouts_company_trip_idx" ON "trip_cargo_layouts" ("company_id","trip_id");
