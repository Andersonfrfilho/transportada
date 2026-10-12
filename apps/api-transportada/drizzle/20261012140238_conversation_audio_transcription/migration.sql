-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 264 (contract.md §5.5): a transcrição do áudio da conversa. Aditiva: duas tabelas novas e um índice
-- parcial em anexos. Nada existente é reescrito; a rotina só cria linhas, e o contrato proíbe backfill
-- (`enabled_since` e `routine_started_at` marcam o início de cada empresa).
CREATE TABLE "occurrence_conversation_audio_transcriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"attachment_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"status" varchar(16) NOT NULL,
	"text" text,
	"language" varchar(8),
	"audio_duration_ms" integer,
	"engine" varchar(64),
	"model" varchar(64),
	"processing_ms" integer,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"max_duration_ms" integer,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failure_code" varchar(32),
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "occurrence_conversation_audio_transcriptions_attachment_unique" UNIQUE("company_id","attachment_id"),
	CONSTRAINT "occurrence_conversation_audio_transcriptions_status_check" CHECK ("status" in ('pending', 'ready', 'failed')),
	CONSTRAINT "occurrence_conversation_audio_transcriptions_failure_check" CHECK ("failure_code" is null or "failure_code" in ('unsupported_format', 'too_long', 'empty_audio', 'object_missing', 'sha256_mismatch', 'engine_timeout', 'engine_failed', 'attempts_exhausted', 'company_disabled')),
	CONSTRAINT "occurrence_conversation_audio_transcriptions_failed_code_check" CHECK ("status" <> 'failed' or "failure_code" is not null),
	CONSTRAINT "occurrence_conversation_audio_transcriptions_ready_gen_check" CHECK (("status" = 'ready') = ("generated_at" is not null)),
	CONSTRAINT "occurrence_conversation_audio_transcriptions_too_long_check" CHECK ((coalesce("failure_code", '') = 'too_long') = ("max_duration_ms" is not null)),
	CONSTRAINT "occurrence_conversation_audio_transcriptions_text_length_check" CHECK ("text" is null or char_length("text") <= 20000),
	CONSTRAINT "occurrence_conversation_audio_transcriptions_duration_check" CHECK ("audio_duration_ms" is null or "audio_duration_ms" > 0)
);
--> statement-breakpoint
CREATE TABLE "company_audio_transcription_settings" (
	"company_id" uuid PRIMARY KEY,
	"enabled" boolean DEFAULT true NOT NULL,
	"enabled_since" timestamp with time zone DEFAULT now() NOT NULL,
	"routine_started_at" timestamp with time zone,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "occurrence_conversation_attachments_audio_created_idx" ON "occurrence_conversation_attachments" ("created_at") WHERE "content_type" like 'audio/%';--> statement-breakpoint
CREATE INDEX "occurrence_conversation_audio_transcriptions_conversation_idx" ON "occurrence_conversation_audio_transcriptions" ("company_id","conversation_id","updated_at");--> statement-breakpoint
CREATE INDEX "occurrence_conversation_audio_transcriptions_claim_idx" ON "occurrence_conversation_audio_transcriptions" ("next_attempt_at") WHERE "status" = 'pending';--> statement-breakpoint
ALTER TABLE "occurrence_conversation_audio_transcriptions" ADD CONSTRAINT "occurrence_conversation_audio_transcriptions_company_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_audio_transcriptions" ADD CONSTRAINT "occurrence_conversation_audio_transcriptions_attachment_fk" FOREIGN KEY ("company_id","attachment_id") REFERENCES "occurrence_conversation_attachments"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_audio_transcriptions" ADD CONSTRAINT "occurrence_conversation_audio_transcriptions_conversation_fk" FOREIGN KEY ("company_id","conversation_id") REFERENCES "occurrence_conversations"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_audio_transcription_settings" ADD CONSTRAINT "company_audio_transcription_settings_company_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;