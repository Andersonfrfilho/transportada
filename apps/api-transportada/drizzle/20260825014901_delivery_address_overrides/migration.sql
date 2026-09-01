CREATE TABLE "delivery_address_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"trip_document_id" uuid NOT NULL,
	"requested_by" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"previous_postal_code" text,
	"previous_number" text,
	"previous_city_code" text,
	"previous_label" text NOT NULL,
	"new_postal_code" text,
	"new_number" text,
	"new_city_code" text,
	"new_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_address_overrides_requested_by_check" CHECK (length("requested_by") > 0),
	CONSTRAINT "delivery_address_overrides_reason_check" CHECK (length("reason") > 0)
);
--> statement-breakpoint
CREATE INDEX "delivery_address_overrides_company_document_idx" ON "delivery_address_overrides" ("company_id","trip_document_id");--> statement-breakpoint
ALTER TABLE "delivery_address_overrides" ADD CONSTRAINT "delivery_address_overrides_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "delivery_address_overrides" ADD CONSTRAINT "delivery_address_overrides_company_document_fk" FOREIGN KEY ("company_id","trip_document_id") REFERENCES "trip_documents"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "delivery_address_overrides" ADD CONSTRAINT "delivery_address_overrides_actor_membership_fk" FOREIGN KEY ("actor_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
CREATE FUNCTION "reject_delivery_address_overrides_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'delivery_address_overrides is append-only' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "delivery_address_overrides_append_only_trigger"
BEFORE UPDATE OR DELETE ON "delivery_address_overrides"
FOR EACH ROW
EXECUTE FUNCTION "reject_delivery_address_overrides_mutation"();