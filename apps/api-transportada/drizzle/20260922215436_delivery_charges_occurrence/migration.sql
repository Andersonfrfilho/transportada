ALTER TABLE "delivery_charges" ADD COLUMN "occurrence_id" uuid;--> statement-breakpoint
CREATE INDEX "delivery_charges_company_occurrence_idx" ON "delivery_charges" ("company_id","occurrence_id") WHERE "occurrence_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_charges_occurrence_unique" ON "delivery_charges" ("company_id","occurrence_id") WHERE "occurrence_id" is not null;--> statement-breakpoint
CREATE INDEX "delivery_charges_contractor_period_idx" ON "delivery_charges" ("company_id","contractor_id","charged_on");--> statement-breakpoint
ALTER TABLE "delivery_charges" ADD CONSTRAINT "delivery_charges_company_occurrence_fk" FOREIGN KEY ("company_id","occurrence_id") REFERENCES "trip_document_occurrences"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "delivery_charges" ADD CONSTRAINT "delivery_charges_returned_goods_origin_check" CHECK ("charge_type" <> 'returned_goods' or ("origin" = 'occurrence' and "occurrence_id" is not null));--> statement-breakpoint
ALTER TABLE "delivery_charges" ADD CONSTRAINT "delivery_charges_occurrence_type_check" CHECK ("occurrence_id" is null or "charge_type" = 'returned_goods');--> statement-breakpoint
ALTER TABLE "delivery_charges" DROP CONSTRAINT "delivery_charges_type_check";--> statement-breakpoint
ALTER TABLE "delivery_charges" ADD CONSTRAINT "delivery_charges_type_check" CHECK ("charge_type" in ('unloading', 'scheduling', 'platform', 'parking', 'other', 'returned_goods')) NOT VALID;--> statement-breakpoint
ALTER TABLE "delivery_charges" VALIDATE CONSTRAINT "delivery_charges_type_check";--> statement-breakpoint
ALTER TABLE "delivery_client_charge_rules" DROP CONSTRAINT "delivery_client_charge_rules_type_check";--> statement-breakpoint
ALTER TABLE "delivery_client_charge_rules" ADD CONSTRAINT "delivery_client_charge_rules_type_check" CHECK ("charge_type" in ('unloading', 'scheduling', 'platform', 'parking', 'other', 'returned_goods')) NOT VALID;--> statement-breakpoint
ALTER TABLE "delivery_client_charge_rules" VALIDATE CONSTRAINT "delivery_client_charge_rules_type_check";
