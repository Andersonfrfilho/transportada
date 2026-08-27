CREATE TABLE "route_suggestion_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"nfe_document_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "route_suggestion_documents_suggestion_document_unique" UNIQUE("suggestion_id","nfe_document_id")
);
--> statement-breakpoint
CREATE TABLE "route_suggestion_stop_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"suggestion_stop_id" uuid NOT NULL,
	"nfe_document_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "route_suggestion_stop_documents_stop_document_unique" UNIQUE("suggestion_stop_id","nfe_document_id")
);
--> statement-breakpoint
CREATE TABLE "route_suggestion_vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"position" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "route_suggestion_vehicles_suggestion_vehicle_unique" UNIQUE("suggestion_id","vehicle_id"),
	CONSTRAINT "route_suggestion_vehicles_suggestion_position_unique" UNIQUE("suggestion_id","position"),
	CONSTRAINT "route_suggestion_vehicles_position_check" CHECK ("position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "route_suggestion_stops" ADD COLUMN "vehicle_id" uuid;--> statement-breakpoint
ALTER TABLE "route_suggestion_stops" ADD CONSTRAINT "route_suggestion_stops_company_id_id_unique" UNIQUE("company_id","id");--> statement-breakpoint
ALTER TABLE "route_suggestion_documents" ADD CONSTRAINT "route_suggestion_documents_suggestion_fk" FOREIGN KEY ("company_id","suggestion_id") REFERENCES "route_suggestions"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "route_suggestion_documents" ADD CONSTRAINT "route_suggestion_documents_document_fk" FOREIGN KEY ("company_id","nfe_document_id") REFERENCES "nfe_documents"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "route_suggestion_stop_documents" ADD CONSTRAINT "route_suggestion_stop_documents_stop_fk" FOREIGN KEY ("company_id","suggestion_stop_id") REFERENCES "route_suggestion_stops"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "route_suggestion_stop_documents" ADD CONSTRAINT "route_suggestion_stop_documents_document_fk" FOREIGN KEY ("company_id","nfe_document_id") REFERENCES "nfe_documents"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "route_suggestion_vehicles" ADD CONSTRAINT "route_suggestion_vehicles_suggestion_fk" FOREIGN KEY ("company_id","suggestion_id") REFERENCES "route_suggestions"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "route_suggestion_vehicles" ADD CONSTRAINT "route_suggestion_vehicles_vehicle_fk" FOREIGN KEY ("company_id","vehicle_id") REFERENCES "fleet_vehicles"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;