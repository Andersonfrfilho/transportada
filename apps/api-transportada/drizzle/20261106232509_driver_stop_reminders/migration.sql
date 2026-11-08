-- Spec 299 T1.2: tabelas do lembrete ao motorista e a rotina `driver.stop-reminder.dispatch`, que entra no relógio **pausada**
-- (origem `system`) até a T2.4 registrar a rotina no worker. Aditiva: nada existente é alterado, só o nome nas duas CHECK de `job`.
CREATE TABLE "company_driver_reminder_settings" (
	"company_id" uuid PRIMARY KEY,
	"enabled" boolean DEFAULT false NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"interval_minutes" integer DEFAULT 30 NOT NULL,
	"grace_min_minutes" integer DEFAULT 30 NOT NULL,
	"grace_percent" integer DEFAULT 50 NOT NULL,
	"dwell_minutes" integer DEFAULT 30 NOT NULL,
	"operating_hours" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_driver_reminder_settings_max_attempts_check" CHECK ("max_attempts" between 1 and 5),
	CONSTRAINT "company_driver_reminder_settings_interval_check" CHECK ("interval_minutes" between 10 and 120),
	CONSTRAINT "company_driver_reminder_settings_grace_check" CHECK ("grace_min_minutes" >= 0 and "grace_percent" between 0 and 100),
	CONSTRAINT "company_driver_reminder_settings_dwell_check" CHECK ("dwell_minutes" >= 0),
	CONSTRAINT "company_driver_reminder_settings_operating_hours_check" CHECK (jsonb_typeof("operating_hours") = 'array')
);
--> statement-breakpoint
CREATE TABLE "driver_stop_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"trip_stop_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"stage" varchar(16) NOT NULL,
	"status" varchar(16) NOT NULL,
	"anchor_at" timestamp with time zone NOT NULL,
	"origin_kind" varchar(16) NOT NULL,
	"travel_seconds" integer,
	"expected_at" timestamp with time zone,
	"due_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"postponements" integer DEFAULT 0 NOT NULL,
	"last_sent_at" timestamp with time zone,
	"last_channel" varchar(16),
	"last_provider_message_id" text,
	"dispatching_until" timestamp with time zone,
	"closed_reason" varchar(24),
	"closed_at" timestamp with time zone,
	"escalated_at" timestamp with time zone,
	"dismissed_by_user_id" uuid,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "driver_stop_reminders_stage_check" CHECK ("stage" in ('arrival', 'settlement')),
	CONSTRAINT "driver_stop_reminders_status_check" CHECK ("status" in ('pending', 'closed', 'escalated', 'cancelled')),
	CONSTRAINT "driver_stop_reminders_origin_kind_check" CHECK ("origin_kind" in ('shared_point', 'previous_stop', 'company', 'fallback')),
	CONSTRAINT "driver_stop_reminders_last_channel_check" CHECK ("last_channel" is null or "last_channel" in ('group', 'direct_text', 'direct_template')),
	CONSTRAINT "driver_stop_reminders_closed_reason_check" CHECK ("closed_reason" is null or "closed_reason" in ('arrived', 'stop_closed', 'occurrence', 'superseded', 'departure_cancelled', 'trip_closed', 'trip_cancelled', 'dismissed')),
	CONSTRAINT "driver_stop_reminders_counters_check" CHECK ("attempts" >= 0 and "postponements" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "driver_stop_reminders_pending_stop_stage_unique" ON "driver_stop_reminders" ("trip_stop_id","stage") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "driver_stop_reminders_status_due_idx" ON "driver_stop_reminders" ("status","due_at");--> statement-breakpoint
ALTER TABLE "company_driver_reminder_settings" ADD CONSTRAINT "company_driver_reminder_settings_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "driver_stop_reminders" ADD CONSTRAINT "driver_stop_reminders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "driver_stop_reminders" ADD CONSTRAINT "driver_stop_reminders_company_trip_fk" FOREIGN KEY ("company_id","trip_id") REFERENCES "trips"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "driver_stop_reminders" ADD CONSTRAINT "driver_stop_reminders_company_trip_stop_fk" FOREIGN KEY ("company_id","trip_stop_id") REFERENCES "trip_stops"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "driver_stop_reminders" ADD CONSTRAINT "driver_stop_reminders_company_driver_fk" FOREIGN KEY ("company_id","driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check", ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read', 'conversation.audio.transcribe', 'cargo-preview.retention.apply', 'nfe.recipient-email.backfill', 'holiday.provider.pull', 'occurrence.automatic-mail.sweep', 'occurrence.contractor-reply.alert', 'driver.stop-reminder.dispatch'));--> statement-breakpoint
ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check", ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read', 'conversation.audio.transcribe', 'cargo-preview.retention.apply', 'nfe.recipient-email.backfill', 'holiday.provider.pull', 'occurrence.automatic-mail.sweep', 'occurrence.contractor-reply.alert', 'driver.stop-reminder.dispatch'));
--> statement-breakpoint
INSERT INTO "job_schedules" ("job", "interval_seconds", "next_run_at", "enabled", "paused_at", "paused_origin") VALUES
	('driver.stop-reminder.dispatch', 300, now(), false, now(), 'system');
