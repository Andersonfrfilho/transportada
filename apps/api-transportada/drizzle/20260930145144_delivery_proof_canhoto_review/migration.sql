-- Spec 220 RF24-RF28 (T6.3): o canhoto ganha veredito de conferência.
--
-- Aditiva e inerte: as dez colunas nascem NULL (ou 'not_applicable'), nenhum código ainda as lê ou
-- escreve, e não há backfill — a T6.1 mediu que em 21/09 a produção não tinha nenhum objeto de
-- `delivery_proof`, então o conjunto a preencher é vazio.
--
-- Custo de lock a enxergar em produção:
--   * `ADD COLUMN ... NOT NULL DEFAULT` não reescreve a tabela no PG 11+ — o default fica no
--     catálogo. É rápido mesmo com a tabela cheia.
--   * Todo CHECK e a FK entram `NOT VALID` e são validados em statement à parte: `ADD CONSTRAINT`
--     validando toma ACCESS EXCLUSIVE com varredura completa, enquanto `VALIDATE CONSTRAINT` toma
--     só SHARE UPDATE EXCLUSIVE e não barra leitura nem escrita.
--   * A FK toca também `trip_documents`, que é caminho quente de importação — mais um motivo para
--     ela não validar junto do ADD.
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "canhoto_review" varchar(16) DEFAULT 'not_applicable' NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "canhoto_review_origin" varchar(16);--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "canhoto_review_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "canhoto_review_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "canhoto_review_reason" varchar(16);--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "canhoto_review_note" varchar(500);--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "canhoto_read_number" varchar(9);--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "canhoto_read_series" varchar(3);--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "canhoto_read_source" varchar(16);--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "canhoto_read_document_id" uuid;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_company_canhoto_read_document_fk" FOREIGN KEY ("company_id","canhoto_read_document_id") REFERENCES "trip_documents"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" VALIDATE CONSTRAINT "trip_delivery_proofs_company_canhoto_read_document_fk";--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_canhoto_review_check" CHECK ("canhoto_review" in ('not_applicable', 'pending', 'approved', 'rejected')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" VALIDATE CONSTRAINT "trip_delivery_proofs_canhoto_review_check";--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_canhoto_review_kind_check" CHECK ("kind" = 'photo' or "canhoto_review" = 'not_applicable') NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" VALIDATE CONSTRAINT "trip_delivery_proofs_canhoto_review_kind_check";--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_canhoto_review_origin_check" CHECK ("canhoto_review_origin" is null or "canhoto_review_origin" in ('automatic', 'manual')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" VALIDATE CONSTRAINT "trip_delivery_proofs_canhoto_review_origin_check";--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_canhoto_review_resolved_check" CHECK (("canhoto_review_origin" is not null) = ("canhoto_review" in ('approved', 'rejected'))) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" VALIDATE CONSTRAINT "trip_delivery_proofs_canhoto_review_resolved_check";--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_canhoto_review_at_check" CHECK (("canhoto_review_at" is null) = ("canhoto_review_origin" is null)) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" VALIDATE CONSTRAINT "trip_delivery_proofs_canhoto_review_at_check";--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_canhoto_review_actor_check" CHECK (("canhoto_review_by_user_id" is not null) = ("canhoto_review_origin" is not distinct from 'manual')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" VALIDATE CONSTRAINT "trip_delivery_proofs_canhoto_review_actor_check";--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_canhoto_review_reason_check" CHECK (("canhoto_review_reason" is not null) = ("canhoto_review" = 'rejected')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" VALIDATE CONSTRAINT "trip_delivery_proofs_canhoto_review_reason_check";--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_canhoto_review_reason_list_check" CHECK ("canhoto_review_reason" is null or "canhoto_review_reason" in ('illegible', 'wrong_document', 'missing_signature', 'other')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" VALIDATE CONSTRAINT "trip_delivery_proofs_canhoto_review_reason_list_check";--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_canhoto_review_note_check" CHECK (("canhoto_review_note" is not null) = ("canhoto_review_reason" is not distinct from 'other')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" VALIDATE CONSTRAINT "trip_delivery_proofs_canhoto_review_note_check";--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_canhoto_review_note_length_check" CHECK ("canhoto_review_note" is null or length("canhoto_review_note") between 20 and 500) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" VALIDATE CONSTRAINT "trip_delivery_proofs_canhoto_review_note_length_check";--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_canhoto_read_source_check" CHECK ("canhoto_read_source" is null or "canhoto_read_source" in ('barcode', 'ocr')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" VALIDATE CONSTRAINT "trip_delivery_proofs_canhoto_read_source_check";--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_canhoto_read_number_check" CHECK (("canhoto_read_number" is null) = ("canhoto_read_source" is null)) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" VALIDATE CONSTRAINT "trip_delivery_proofs_canhoto_read_number_check";--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_canhoto_read_series_check" CHECK ("canhoto_read_series" is null or "canhoto_read_number" is not null) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" VALIDATE CONSTRAINT "trip_delivery_proofs_canhoto_read_series_check";--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_canhoto_read_kind_check" CHECK ("kind" = 'photo' or ("canhoto_read_source" is null and "canhoto_read_document_id" is null)) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" VALIDATE CONSTRAINT "trip_delivery_proofs_canhoto_read_kind_check";--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_canhoto_auto_approval_check" CHECK ("canhoto_review" <> 'approved' or "canhoto_review_origin" <> 'automatic' or "canhoto_read_source" = 'barcode') NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" VALIDATE CONSTRAINT "trip_delivery_proofs_canhoto_auto_approval_check";
