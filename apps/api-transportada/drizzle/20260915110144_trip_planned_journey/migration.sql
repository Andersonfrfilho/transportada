ALTER TABLE "trips" ADD COLUMN "planned_journey_seconds" bigint;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "planned_journey_includes_return" boolean;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_planned_journey_check" CHECK (("planned_journey_seconds" is null) = ("planned_journey_includes_return" is null));--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_planned_journey_seconds_check" CHECK ("planned_journey_seconds" is null or "planned_journey_seconds" >= 0);