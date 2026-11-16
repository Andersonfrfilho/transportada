ALTER TABLE "pickup_requests" ADD COLUMN "origin_contact_name" text;--> statement-breakpoint
ALTER TABLE "pickup_requests" ADD COLUMN "origin_contact_phone" text;--> statement-breakpoint
ALTER TABLE "pickup_requests" ADD COLUMN "destination_contact_name" text;--> statement-breakpoint
ALTER TABLE "pickup_requests" ADD COLUMN "destination_contact_phone" text;--> statement-breakpoint
ALTER TABLE "pickup_requests" ADD COLUMN "access_notes" text;--> statement-breakpoint
ALTER TABLE "pickup_requests" ADD COLUMN "cargo_value" numeric(19,4);