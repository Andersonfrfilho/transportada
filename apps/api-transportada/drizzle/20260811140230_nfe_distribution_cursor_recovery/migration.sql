ALTER TABLE "nfe_distribution_cursors" ADD COLUMN "consecutive_rate_limits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "nfe_distribution_cursors" ADD COLUMN "last_skipped_from_nsu" text;--> statement-breakpoint
ALTER TABLE "nfe_distribution_cursors" ADD COLUMN "last_skipped_to_nsu" text;--> statement-breakpoint
ALTER TABLE "nfe_distribution_cursors" ADD COLUMN "last_skipped_at" timestamp with time zone;