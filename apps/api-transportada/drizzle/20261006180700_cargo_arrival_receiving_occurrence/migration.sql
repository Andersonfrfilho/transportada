-- Copyright (c) 2026 Ada Technology. MIT License.
-- Spec 237 Fase 3 (ADR-0094 §9): a ocorrência de recebimento é linha de `trip_document_occurrences`, dona
-- por coluna irmã, e a marcação "devolver ao contratante" é coluna ortogonal de `cargo_arrival_documents`.
--
-- Aditiva nos dados: `trip_document_id` troca o `NOT NULL` pelo CHECK de exatamente um dono, e toda linha
-- existente o satisfaz por construção (o `NOT NULL` vigente garante `trip_document_id` presente, e a
-- coluna nova nasce nula). Os CHECKs de etapa só ganham `receiving`. `ADD COLUMN` sem default e
-- `DROP NOT NULL` só mexem no catálogo; o unique novo de `trip_document_occurrences` constrói um índice
-- sobre a tabela inteira (alvo da FK do motivo da devolução, que não pode ser parcial) — medir a tabela
-- antes de produção (`docs/SECURITY.md`, 2026-10-06). CHECK/FK novos com NOT VALID + VALIDATE, no molde
-- de `20261003010806`; a pasta roda numa transação, e o `lock_timeout` aborta em 3 s em vez de enfileirar
-- o registro de ocorrência atrás de uma transação longa.
SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD COLUMN "cargo_arrival_document_id" uuid;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ALTER COLUMN "trip_document_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD CONSTRAINT "trip_document_occurrences_owner_check" CHECK (num_nonnulls("trip_document_id", "cargo_arrival_document_id") = 1) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" VALIDATE CONSTRAINT "trip_document_occurrences_owner_check";--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" DROP CONSTRAINT "trip_document_occurrences_stage_check", ADD CONSTRAINT "trip_document_occurrences_stage_check" CHECK ("stage" in ('delivery', 'separation', 'receiving')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" VALIDATE CONSTRAINT "trip_document_occurrences_stage_check";--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD CONSTRAINT "trip_document_occurrences_receiving_owner_check" CHECK (("stage" = 'receiving') = ("cargo_arrival_document_id" is not null)) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" VALIDATE CONSTRAINT "trip_document_occurrences_receiving_owner_check";--> statement-breakpoint
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT "company_occurrence_types_stage_check", ADD CONSTRAINT "company_occurrence_types_stage_check" CHECK ("stage" in ('delivery', 'separation', 'receiving')) NOT VALID;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" VALIDATE CONSTRAINT "company_occurrence_types_stage_check";--> statement-breakpoint
ALTER TABLE "cargo_arrival_documents" ADD CONSTRAINT "cargo_arrival_documents_company_id_id_unique" UNIQUE("company_id","id");--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD CONSTRAINT "trip_document_occurrences_company_arrival_document_fk" FOREIGN KEY ("company_id","cargo_arrival_document_id") REFERENCES "cargo_arrival_documents"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" VALIDATE CONSTRAINT "trip_document_occurrences_company_arrival_document_fk";--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD CONSTRAINT "trip_document_occurrences_company_arrival_document_id_unique" UNIQUE("company_id","cargo_arrival_document_id","id");--> statement-breakpoint
ALTER TABLE "cargo_arrival_documents" ADD COLUMN "return_to_contractor" varchar(16) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "cargo_arrival_documents" ADD COLUMN "return_occurrence_id" uuid;--> statement-breakpoint
ALTER TABLE "cargo_arrival_documents" ADD CONSTRAINT "cargo_arrival_documents_return_to_contractor_check" CHECK ("return_to_contractor" in ('marked', 'none', 'returned')) NOT VALID;--> statement-breakpoint
ALTER TABLE "cargo_arrival_documents" VALIDATE CONSTRAINT "cargo_arrival_documents_return_to_contractor_check";--> statement-breakpoint
ALTER TABLE "cargo_arrival_documents" ADD CONSTRAINT "cargo_arrival_documents_return_occurrence_check" CHECK (("return_to_contractor" = 'none') = ("return_occurrence_id" is null)) NOT VALID;--> statement-breakpoint
ALTER TABLE "cargo_arrival_documents" VALIDATE CONSTRAINT "cargo_arrival_documents_return_occurrence_check";--> statement-breakpoint
ALTER TABLE "cargo_arrival_documents" ADD CONSTRAINT "cargo_arrival_documents_return_occurrence_fk" FOREIGN KEY ("company_id","id","return_occurrence_id") REFERENCES "trip_document_occurrences"("company_id","cargo_arrival_document_id","id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;--> statement-breakpoint
ALTER TABLE "cargo_arrival_documents" VALIDATE CONSTRAINT "cargo_arrival_documents_return_occurrence_fk";--> statement-breakpoint
ALTER TABLE "cargo_arrival_events" DROP CONSTRAINT "cargo_arrival_events_kind_check", ADD CONSTRAINT "cargo_arrival_events_kind_check" CHECK ("kind" in ('arrival_closed', 'arrival_registered', 'document_added', 'document_received', 'document_separated', 'occurrence_registered', 'return_completed', 'return_marked', 'return_unmarked', 'route_assigned')) NOT VALID;--> statement-breakpoint
ALTER TABLE "cargo_arrival_events" VALIDATE CONSTRAINT "cargo_arrival_events_kind_check";--> statement-breakpoint
-- A pasta roda na mesma transação das migrations seguintes: devolve o prazo ao padrão da sessão.
SET LOCAL lock_timeout = DEFAULT;
