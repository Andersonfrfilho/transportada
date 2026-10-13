-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 263 (ADR-0101): a conversa com o motorista ganha assunto (ocorrência, nota, viagem). Aditiva:
-- 1. colunas novas nulas, com `subject_type` padrão `occurrence` — toda linha de hoje já é ocorrência;
-- 2. `occurrence_kind`/`occurrence_id` passam a aceitar nulo nas duas tabelas, e o CHECK de forma
--    (`occurrence_conversations_subject_shape_check`) mantém exatamente o que já era exigido da ocorrência;
-- 3. únicos parciais de nota e de viagem; o único antigo e as consultas por chave ficam intactos;
-- 4. `client_message_id` (eco da Idempotency-Key) com CHECK de formato e único parcial por direção. O
--    tamanho vai em `char_length`: o regex do Postgres não aceita repetição acima de 255.
-- Sem UPDATE em dado e sem backfill. As CHECKs validam as linhas existentes ao serem criadas.
ALTER TABLE "occurrence_conversation_messages" ADD COLUMN "client_message_id" text;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_uploads" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "occurrence_conversations" ADD COLUMN "subject_type" varchar(16) DEFAULT 'occurrence' NOT NULL;--> statement-breakpoint
ALTER TABLE "occurrence_conversations" ADD COLUMN "trip_id" uuid;--> statement-breakpoint
ALTER TABLE "occurrence_conversations" ADD COLUMN "trip_document_id" uuid;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_uploads" ALTER COLUMN "occurrence_kind" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_uploads" ALTER COLUMN "occurrence_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "occurrence_conversations" ALTER COLUMN "occurrence_kind" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "occurrence_conversations" ALTER COLUMN "occurrence_id" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "occurrence_conversation_messages_client_message_unique" ON "occurrence_conversation_messages" ("company_id","conversation_id","direction","client_message_id") WHERE "client_message_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "occurrence_conversations_document_subject_unique" ON "occurrence_conversations" ("company_id","trip_document_id","participant") WHERE "subject_type" = 'document';--> statement-breakpoint
CREATE UNIQUE INDEX "occurrence_conversations_trip_subject_unique" ON "occurrence_conversations" ("company_id","trip_id","participant") WHERE "subject_type" = 'trip';--> statement-breakpoint
CREATE INDEX "occurrence_conversations_driver_user_idx" ON "occurrence_conversations" ("company_id","driver_user_id") WHERE "participant" = 'driver';--> statement-breakpoint
CREATE INDEX "occurrence_conversations_trip_idx" ON "occurrence_conversations" ("company_id","trip_id") WHERE "trip_id" is not null;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_uploads" ADD CONSTRAINT "occurrence_conversation_uploads_conversation_fk" FOREIGN KEY ("company_id","conversation_id") REFERENCES "occurrence_conversations"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversations" ADD CONSTRAINT "occurrence_conversations_trip_fk" FOREIGN KEY ("company_id","trip_id") REFERENCES "trips"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversations" ADD CONSTRAINT "occurrence_conversations_trip_document_fk" FOREIGN KEY ("company_id","trip_document_id") REFERENCES "trip_documents"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_messages" ADD CONSTRAINT "occurrence_conversation_messages_client_message_id_check" CHECK ("client_message_id" is null or (char_length("client_message_id") between 16 and 256 and "client_message_id" ~ '^[A-Za-z0-9._:-]+$'));--> statement-breakpoint
ALTER TABLE "occurrence_conversation_uploads" ADD CONSTRAINT "occurrence_conversation_uploads_subject_check" CHECK (("occurrence_kind" is not null and "occurrence_id" is not null and "conversation_id" is null)
        or ("occurrence_kind" is null and "occurrence_id" is null and "conversation_id" is not null));--> statement-breakpoint
ALTER TABLE "occurrence_conversations" ADD CONSTRAINT "occurrence_conversations_subject_type_check" CHECK ("subject_type" in ('occurrence', 'document', 'trip'));--> statement-breakpoint
ALTER TABLE "occurrence_conversations" ADD CONSTRAINT "occurrence_conversations_subject_shape_check" CHECK (("subject_type" = 'occurrence' and "occurrence_kind" is not null and "occurrence_id" is not null and "trip_id" is null and "trip_document_id" is null)
        or ("subject_type" = 'document' and "participant" = 'driver' and "trip_id" is not null and "trip_document_id" is not null and "occurrence_kind" is null and "occurrence_id" is null)
        or ("subject_type" = 'trip' and "participant" = 'driver' and "trip_id" is not null and "trip_document_id" is null and "occurrence_kind" is null and "occurrence_id" is null));