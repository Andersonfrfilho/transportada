-- Copyright (c) 2026 Ada Technology. MIT License.
-- ADR-0042: a viagem passa de dois estados (open/closed) para oito estados operacionais, e a nota
-- ganha um eixo próprio (separation_status) do qual o estado da viagem é derivado. Backfill
-- aditivo: open->draft, closed->completed; nota com delivered_at->delivered; as demais de viagem
-- fechada->returned com motivo 'migration' (spec 056 T002).
ALTER TABLE "trip_documents" ADD COLUMN "separation_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_documents" ADD COLUMN "separated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_documents" ADD COLUMN "loaded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_documents" ADD COLUMN "returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_documents" ADD COLUMN "return_reason" text;--> statement-breakpoint
UPDATE "trip_documents"
SET "separation_status" = 'delivered'
WHERE "delivered_at" IS NOT NULL;--> statement-breakpoint
UPDATE "trip_documents" "d"
SET "separation_status" = 'returned',
    "returned_at" = "d"."updated_at",
    "return_reason" = 'migration'
FROM "trips" "t"
WHERE "t"."id" = "d"."trip_id"
  AND "d"."delivered_at" IS NULL
  AND "t"."status" = 'closed';--> statement-breakpoint
ALTER TABLE "trips" DROP CONSTRAINT "trips_status_check";--> statement-breakpoint
UPDATE "trips"
SET "status" = CASE "status" WHEN 'open' THEN 'draft' WHEN 'closed' THEN 'completed' ELSE "status" END
WHERE "status" IN ('open', 'closed');--> statement-breakpoint
ALTER TABLE "trips" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "trip_documents" ADD CONSTRAINT "trip_documents_separation_status_check" CHECK ("separation_status" in ('pending', 'separated', 'loaded', 'delivered', 'returned'));--> statement-breakpoint
ALTER TABLE "trip_documents" ADD CONSTRAINT "trip_documents_return_reason_check" CHECK (("separation_status" = 'returned') = ("return_reason" is not null));--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_status_check" CHECK ("status" in ('draft', 'route_planned', 'separating', 'loading', 'dispatched', 'in_transit', 'completed', 'cancelled'));
