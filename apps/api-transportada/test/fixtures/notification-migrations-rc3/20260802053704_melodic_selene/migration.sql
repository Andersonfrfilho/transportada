CREATE SCHEMA "notification";
--> statement-breakpoint
CREATE TABLE "notification"."deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"channel" varchar(16) NOT NULL,
	"driver" varchar(32),
	"target_masked" varchar(128),
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"provider_message_id" varchar(256),
	"error_code" varchar(64),
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification"."devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" varchar(16) NOT NULL,
	"driver" varchar(16) NOT NULL,
	"token" text NOT NULL,
	"app_version" varchar(32),
	"locale" varchar(16),
	"timezone" varchar(64),
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	"disabled_reason" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"category" varchar(64) NOT NULL,
	"template_key" varchar(128) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"title" varchar(256) NOT NULL,
	"body" text NOT NULL,
	"dedupe_key" varchar(256),
	"scheduled_for" timestamp with time zone,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"read_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification"."preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"category" varchar(64) NOT NULL,
	"channel" varchar(16) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"quiet_hours_start" varchar(5),
	"quiet_hours_end" varchar(5),
	"timezone" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification"."suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"channel" varchar(16) NOT NULL,
	"target_hash" varchar(128) NOT NULL,
	"reason" varchar(16) NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification"."templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"key" varchar(128) NOT NULL,
	"channel" varchar(16) NOT NULL,
	"locale" varchar(16) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"subject" varchar(256),
	"body" text NOT NULL,
	"whatsapp_template_name" varchar(128),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification"."deliveries" ADD CONSTRAINT "deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "notification"."notifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_deliveries_notification" ON "notification"."deliveries" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "idx_deliveries_company_status" ON "notification"."deliveries" USING btree ("company_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_deliveries_provider_message" ON "notification"."deliveries" USING btree ("channel","provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_devices_driver_token" ON "notification"."devices" USING btree ("driver","token");--> statement-breakpoint
CREATE INDEX "idx_devices_company_user" ON "notification"."devices" USING btree ("company_id","user_id","disabled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_notifications_dedupe" ON "notification"."notifications" USING btree ("company_id","dedupe_key") WHERE "notification"."notifications"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "idx_notifications_inbox" ON "notification"."notifications" USING btree ("company_id","recipient_user_id","read_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_due" ON "notification"."notifications" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_preferences_identity" ON "notification"."preferences" USING btree ("company_id","user_id","category","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_suppressions_identity" ON "notification"."suppressions" USING btree ("company_id","channel","target_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_templates_identity" ON "notification"."templates" USING btree ("company_id","key","channel","locale","version");