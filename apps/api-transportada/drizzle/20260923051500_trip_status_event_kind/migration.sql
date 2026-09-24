ALTER TABLE "trip_status_events" ADD COLUMN "event_kind" varchar(16) DEFAULT 'transition' NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_status_events" ADD CONSTRAINT "trip_status_events_event_kind_check" CHECK ("event_kind" in ('created', 'transition'));--> statement-breakpoint
ALTER TABLE "trip_status_events" DROP CONSTRAINT "trip_status_events_transition_check";--> statement-breakpoint
ALTER TABLE "trip_status_events" ADD CONSTRAINT "trip_status_events_transition_check" CHECK ("event_kind" <> 'transition' or "from_status" <> "to_status");
