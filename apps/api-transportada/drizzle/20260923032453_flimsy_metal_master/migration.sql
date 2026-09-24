CREATE TABLE "company_entry_kinds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"side" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"display_order" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_entry_kinds_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "company_entry_kinds_company_side_name_unique" UNIQUE("company_id","side","name"),
	CONSTRAINT "company_entry_kinds_side_check" CHECK ("side" in ('expense', 'revenue'))
);
--> statement-breakpoint
CREATE TABLE "trip_revenue_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"entry_kind_id" uuid NOT NULL,
	"amount" numeric(19,4) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_revenue_entries_amount_check" CHECK ("amount" > 0)
);
--> statement-breakpoint
CREATE INDEX "company_entry_kinds_company_side_idx" ON "company_entry_kinds" ("company_id","side");--> statement-breakpoint
CREATE INDEX "trip_revenue_entries_trip_idx" ON "trip_revenue_entries" ("company_id","trip_id");--> statement-breakpoint
ALTER TABLE "company_entry_kinds" ADD CONSTRAINT "company_entry_kinds_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_revenue_entries" ADD CONSTRAINT "trip_revenue_entries_company_trip_fk" FOREIGN KEY ("company_id","trip_id") REFERENCES "trips"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_revenue_entries" ADD CONSTRAINT "trip_revenue_entries_entry_kind_fk" FOREIGN KEY ("company_id","entry_kind_id") REFERENCES "company_entry_kinds"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
/*
 Spec 169 RF2: as duas espécies de hoje (Pedágio, Avulso) viram linhas semeadas, do lado `expense`,
 para toda empresa já cadastrada — nenhuma instalação perde o que já usa.
*/
INSERT INTO "company_entry_kinds" ("company_id", "name", "side", "display_order")
SELECT "id", 'Pedágio', 'expense', 1 FROM "companies"
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "company_entry_kinds" ("company_id", "name", "side", "display_order")
SELECT "id", 'Avulso', 'expense', 2 FROM "companies"
ON CONFLICT DO NOTHING;