-- Spec 222 RF-B (T5.3, T5.3b): a rotina `trip.canhoto.read` entra no relógio e a leitura do canhoto
-- ganha a coluna e o índice de que a fila precisa.
--
-- Aditiva: a coluna nasce NULL e **sem backfill** — nulo é "a máquina ainda não tentou" (RF-B9) —,
-- e a rotina nasce com a linha em `job_schedules` na batida de cinco minutos.
--
-- Custo de lock a enxergar em produção:
--   * `ADD COLUMN` anulável sem default só toca o catálogo; não reescreve a tabela.
--   * As duas CHECK de `job` entram `NOT VALID` e são validadas à parte (SHARE UPDATE EXCLUSIVE);
--     as tabelas são minúsculas, então o ganho é o molde, não o tempo.
--   * `CREATE INDEX` toma SHARE sobre `trip_delivery_proofs` enquanto constrói, e escrita espera. O
--     predicado só indexa o que está pendente e nunca lido — um conjunto pequeno —, mas a varredura
--     para construí-lo é da tabela inteira. Fora do horário de campo, ou aceitar a espera.
--
-- ⚠️ O predicado do índice usa literais (`= 'pending'`), sem `kind`: o Postgres prova a implicação
-- do índice parcial a partir dos quals da consulta, e não do CHECK. A consulta da rotina repete os
-- mesmos literais, ou o índice é ignorado em silêncio.
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check";--> statement-breakpoint
ALTER TABLE "job_executions" ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read')) NOT VALID;--> statement-breakpoint
ALTER TABLE "job_executions" VALIDATE CONSTRAINT "job_executions_job_check";--> statement-breakpoint
ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check";--> statement-breakpoint
ALTER TABLE "job_schedules" ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read')) NOT VALID;--> statement-breakpoint
ALTER TABLE "job_schedules" VALIDATE CONSTRAINT "job_schedules_job_check";--> statement-breakpoint
INSERT INTO "job_schedules" ("job", "interval_seconds", "next_run_at") VALUES
	('trip.canhoto.read', 300, now());--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "canhoto_read_attempted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "trip_delivery_proofs_canhoto_pending_idx" ON "trip_delivery_proofs" ("created_at") WHERE "canhoto_review" = 'pending' and "canhoto_read_source" is null and "canhoto_read_attempted_at" is null;
