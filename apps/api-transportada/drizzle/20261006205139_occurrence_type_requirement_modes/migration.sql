-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 246 (RF1, RF3, RF4, RF9, D-a): a exigência da ocorrência vira dado. A ORDEM é a decisão:
-- 1. no tipo, `note_mode` e `signature_mode` com padrão CONSTANTE (não reescreve a tabela);
-- 2. nas duas exceções, as mesmas colunas NULAS e sem padrão — nulo herda do tipo, campo a campo;
-- 3. a regra fixa da 179 ("foto `required` arrasta a observação") sai do caso de uso para o dado:
--    o tipo sobe a `required` onde a foto é `required` (o resto fica no padrão `optional`); a
--    exceção recebe o CASE em TODA linha — uma exceção `optional` sobre tipo `required` com
--    `note_mode` nulo herdaria o `required` e endureceria o que hoje é opcional. `signature_mode`
--    das exceções fica nulo: o tipo nasce `off`, nada a preservar;
-- 4. as CHECKs de vocabulário só depois do dado conforme (nas exceções `in` com nulo passa);
-- 5. por último `signature_object_id` nas duas ocorrências, com a FK composta para o objeto.
ALTER TABLE "company_occurrence_types" ADD COLUMN "note_mode" varchar(16) DEFAULT 'optional' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "signature_mode" varchar(16) DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD COLUMN "note_mode" varchar(16);--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD COLUMN "signature_mode" varchar(16);--> statement-breakpoint
ALTER TABLE "company_occurrence_type_recipient_overrides" ADD COLUMN "note_mode" varchar(16);--> statement-breakpoint
ALTER TABLE "company_occurrence_type_recipient_overrides" ADD COLUMN "signature_mode" varchar(16);--> statement-breakpoint
UPDATE "company_occurrence_types" SET "note_mode" = 'required' WHERE "attachment_mode" = 'required';--> statement-breakpoint
UPDATE "company_occurrence_type_contractor_overrides" SET "note_mode" = CASE WHEN "attachment_mode" = 'required' THEN 'required' ELSE 'optional' END;--> statement-breakpoint
UPDATE "company_occurrence_type_recipient_overrides" SET "note_mode" = CASE WHEN "attachment_mode" = 'required' THEN 'required' ELSE 'optional' END;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_note_mode_check" CHECK ("note_mode" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_signature_mode_check" CHECK ("signature_mode" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD CONSTRAINT "occurrence_type_contractor_overrides_note_mode_check" CHECK ("note_mode" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractor_overrides" ADD CONSTRAINT "occurrence_type_contractor_overrides_signature_mode_check" CHECK ("signature_mode" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "company_occurrence_type_recipient_overrides" ADD CONSTRAINT "occurrence_type_recipient_overrides_note_mode_check" CHECK ("note_mode" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "company_occurrence_type_recipient_overrides" ADD CONSTRAINT "occurrence_type_recipient_overrides_signature_mode_check" CHECK ("signature_mode" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD COLUMN "signature_object_id" uuid;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD COLUMN "signature_object_id" uuid;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD CONSTRAINT "trip_document_occurrences_company_signature_object_fk" FOREIGN KEY ("company_id","signature_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_company_signature_object_fk" FOREIGN KEY ("company_id","signature_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
