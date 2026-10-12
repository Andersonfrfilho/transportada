-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 264 T3.4: a rotina `conversation.audio.transcribe` entra no relógio. Aditiva: as duas CHECK de `job`
-- ganham o nome e a agenda nasce com a linha em `job_schedules` a cada 300 s, **PAUSADA de fábrica** (decisão
-- do dono): a rotina só deve rodar depois de o worker ter o modelo e a imagem; o operador a liga em Operações
-- depois do deploy do worker. Mesma representação de pausa da `holiday.provider.pull`.
--
-- As CHECK entram `NOT VALID` e são validadas à parte; as tabelas são minúsculas.
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check";--> statement-breakpoint
ALTER TABLE "job_executions" ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read', 'conversation.audio.transcribe', 'cargo-preview.retention.apply', 'nfe.recipient-email.backfill', 'holiday.provider.pull')) NOT VALID;--> statement-breakpoint
ALTER TABLE "job_executions" VALIDATE CONSTRAINT "job_executions_job_check";--> statement-breakpoint
ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check";--> statement-breakpoint
ALTER TABLE "job_schedules" ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read', 'conversation.audio.transcribe', 'cargo-preview.retention.apply', 'nfe.recipient-email.backfill', 'holiday.provider.pull')) NOT VALID;--> statement-breakpoint
ALTER TABLE "job_schedules" VALIDATE CONSTRAINT "job_schedules_job_check";--> statement-breakpoint
INSERT INTO "job_schedules" ("job", "interval_seconds", "next_run_at", "enabled", "paused_at", "paused_origin") VALUES
	('conversation.audio.transcribe', 300, now(), false, now(), 'system');
