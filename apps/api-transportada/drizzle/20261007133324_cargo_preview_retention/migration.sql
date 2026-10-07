-- Spec 237 T4.8: a rotina `cargo-preview.retention.apply` entra no relógio e a trilha da prévia ganha o
-- evento `retention_applied`, que é o marcador de "esta prévia já foi retida".
--
-- Aditiva: nenhuma coluna, índice nem tabela nova. Só (1) o nome da rotina nas duas CHECK de `job`,
-- (2) `retention_applied` na CHECK de `kind` da trilha e na de escopo do item (evento de prévia inteira,
-- `item_id` nulo) e (3) a linha de `job_schedules` que faz a rotina rodar uma vez por dia.
--
-- Custo de lock a enxergar em produção:
--   * As quatro CHECK entram `NOT VALID` e são validadas à parte (SHARE UPDATE EXCLUSIVE). `job_*` são
--     tabelas minúsculas; `cargo_preview_events` é pequena e append-only — o ganho é o molde, não o tempo.
--   * `DROP CONSTRAINT`/`ADD CONSTRAINT` tomam ACCESS EXCLUSIVE só durante o comando.
--
-- ⚠️ Reverter só com o worker também revertido — senão a batida publica um job que o CHECK recusa. O
-- rollback recusa se já houver evento `retention_applied` (a trilha é append-only e a CHECK antiga não
-- validaria com essas linhas).
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check";--> statement-breakpoint
ALTER TABLE "job_executions" ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read', 'cargo-preview.retention.apply')) NOT VALID;--> statement-breakpoint
ALTER TABLE "job_executions" VALIDATE CONSTRAINT "job_executions_job_check";--> statement-breakpoint
ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check";--> statement-breakpoint
ALTER TABLE "job_schedules" ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read', 'cargo-preview.retention.apply')) NOT VALID;--> statement-breakpoint
ALTER TABLE "job_schedules" VALIDATE CONSTRAINT "job_schedules_job_check";--> statement-breakpoint
ALTER TABLE "cargo_preview_events" DROP CONSTRAINT "cargo_preview_events_kind_check";--> statement-breakpoint
ALTER TABLE "cargo_preview_events" ADD CONSTRAINT "cargo_preview_events_kind_check" CHECK ("kind" in ('arrival_proposed', 'failed', 'item_ambiguous', 'item_confirmed', 'item_linked_manually', 'item_matched', 'item_suggested', 'item_unlinked', 'parsed', 'retention_applied', 'uploaded')) NOT VALID;--> statement-breakpoint
ALTER TABLE "cargo_preview_events" VALIDATE CONSTRAINT "cargo_preview_events_kind_check";--> statement-breakpoint
ALTER TABLE "cargo_preview_events" DROP CONSTRAINT "cargo_preview_events_item_scope_check";--> statement-breakpoint
ALTER TABLE "cargo_preview_events" ADD CONSTRAINT "cargo_preview_events_item_scope_check" CHECK (("kind" in ('uploaded', 'parsed', 'failed', 'arrival_proposed', 'retention_applied')) = ("item_id" is null)) NOT VALID;--> statement-breakpoint
ALTER TABLE "cargo_preview_events" VALIDATE CONSTRAINT "cargo_preview_events_item_scope_check";--> statement-breakpoint
INSERT INTO "job_schedules" ("job", "interval_seconds", "next_run_at") VALUES
	('cargo-preview.retention.apply', 86400, now());
