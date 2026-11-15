CREATE TABLE "pickup_request_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"pickup_request_id" uuid NOT NULL,
	"event" text NOT NULL,
	"audience" text NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pickup_request_notifications_event_check" CHECK ("event" in ('requested', 'accepted', 'refused', 'scheduled', 'canceled', 'expired', 'stale')),
	CONSTRAINT "pickup_request_notifications_audience_check" CHECK ("audience" in ('client', 'office')),
	CONSTRAINT "pickup_request_notifications_channel_check" CHECK ("channel" in ('email', 'whatsapp')),
	CONSTRAINT "pickup_request_notifications_status_check" CHECK ("status" in ('pending', 'sent', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "pickup_request_notifications_unique" ON "pickup_request_notifications" ("pickup_request_id","event","audience","channel");--> statement-breakpoint
CREATE INDEX "pickup_request_notifications_pending_idx" ON "pickup_request_notifications" ("available_at") WHERE "status" = 'pending';--> statement-breakpoint
ALTER TABLE "pickup_request_notifications" ADD CONSTRAINT "pickup_request_notifications_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "pickup_request_notifications" ADD CONSTRAINT "pickup_request_notifications_request_id_fkey" FOREIGN KEY ("pickup_request_id") REFERENCES "pickup_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check", ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read', 'conversation.audio.transcribe', 'cargo-preview.retention.apply', 'nfe.recipient-email.backfill', 'holiday.provider.pull', 'occurrence.automatic-mail.sweep', 'occurrence.contractor-reply.alert', 'driver.stop-reminder.dispatch', 'whatsapp-inbox.chat.expire', 'company-expense.occurrence.generate', 'company-expense.reminder.send', 'pickup-request.notify'));--> statement-breakpoint
ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check", ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read', 'conversation.audio.transcribe', 'cargo-preview.retention.apply', 'nfe.recipient-email.backfill', 'holiday.provider.pull', 'occurrence.automatic-mail.sweep', 'occurrence.contractor-reply.alert', 'driver.stop-reminder.dispatch', 'whatsapp-inbox.chat.expire', 'company-expense.occurrence.generate', 'company-expense.reminder.send', 'pickup-request.notify'));--> statement-breakpoint
-- Spec 339 T4: a rotina `pickup-request.notify` entra no relógio **pausada** (origem `system`) até o dono autorizar ligar.
INSERT INTO "job_schedules" ("job", "interval_seconds", "next_run_at", "enabled", "paused_at", "paused_origin") VALUES
	('pickup-request.notify', 300, now(), false, now(), 'system');
