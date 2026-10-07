-- Copyright (c) 2026 Ada Technology. MIT License.
-- Spec 237 T4.6 (ADR-0094 §10): a prévia por e-mail encaminhado. Aditiva: três colunas nulas no perfil
-- de recebimento (hash do token do endereço de entrada e as duas listas), a prévia aceita `source =
-- 'email'` sem quem enviou (CHECK amarra os dois) e a tabela append-only que registra o que cada e-mail
-- encaminhado virou (idempotência por mensagem e motivo da recusa). Nenhuma linha existente muda.
CREATE TABLE "cargo_preview_email_intakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"provider_email_id" text NOT NULL,
	"contractor_id" uuid NOT NULL,
	"outcome" varchar(16) NOT NULL,
	"reason_code" varchar(40),
	"preview_id" uuid,
	"is_replay" boolean DEFAULT false NOT NULL,
	"forwarder_dkim_result" varchar(16),
	"original_sender_verification" varchar(16),
	"raw_object_id" uuid,
	"received_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cargo_preview_email_intakes_company_provider_email_unique" UNIQUE("company_id","provider_email_id"),
	CONSTRAINT "cargo_preview_email_intakes_provider_email_id_check" CHECK (char_length("provider_email_id") between 1 and 256),
	CONSTRAINT "cargo_preview_email_intakes_outcome_check" CHECK ("outcome" in ('accepted', 'rejected')),
	CONSTRAINT "cargo_preview_email_intakes_reason_code_check" CHECK ("reason_code" in ('ATTACHMENT_AMBIGUOUS', 'ATTACHMENT_MISSING', 'ATTACHMENT_NOT_A_WORKBOOK', 'ATTACHMENT_TOO_LARGE', 'FORWARDER_DKIM_NOT_ALIGNED', 'FORWARDER_NOT_ALLOWED', 'MIME_UNREADABLE', 'ORIGINAL_SENDER_AMBIGUOUS', 'ORIGINAL_SENDER_MISSING', 'ORIGINAL_SENDER_NOT_ALLOWED', 'PREVIEW_NOT_ENABLED', 'RAW_EMAIL_TOO_LARGE', 'TOO_MANY_OPEN_PREVIEWS')),
	CONSTRAINT "cargo_preview_email_intakes_shape_check" CHECK (("outcome" = 'rejected') = ("reason_code" is not null) and ("outcome" = 'accepted') = ("preview_id" is not null) and ("outcome" = 'accepted' or not "is_replay")),
	CONSTRAINT "cargo_preview_email_intakes_dkim_result_check" CHECK ("forwarder_dkim_result" in ('aligned', 'not_aligned', 'unverifiable', 'absent')),
	CONSTRAINT "cargo_preview_email_intakes_original_sender_check" CHECK ("original_sender_verification" in ('unverified'))
);
--> statement-breakpoint
ALTER TABLE "contractor_receiving_profiles" ADD COLUMN "preview_inbound_token_hash" char(64);--> statement-breakpoint
ALTER TABLE "contractor_receiving_profiles" ADD COLUMN "preview_forwarder_allowlist" text[];--> statement-breakpoint
ALTER TABLE "contractor_receiving_profiles" ADD COLUMN "preview_sender_allowlist" text[];--> statement-breakpoint
ALTER TABLE "cargo_previews" ALTER COLUMN "uploaded_by_user_id" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "contractor_receiving_profiles_company_inbound_token_unique" ON "contractor_receiving_profiles" ("company_id","preview_inbound_token_hash") WHERE "preview_inbound_token_hash" is not null;--> statement-breakpoint
CREATE INDEX "cargo_preview_email_intakes_company_contractor_received_idx" ON "cargo_preview_email_intakes" ("company_id","contractor_id","received_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "cargo_preview_email_intakes" ADD CONSTRAINT "cargo_preview_email_intakes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_preview_email_intakes" ADD CONSTRAINT "cargo_preview_email_intakes_company_contractor_fk" FOREIGN KEY ("company_id","contractor_id") REFERENCES "contractors"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_preview_email_intakes" ADD CONSTRAINT "cargo_preview_email_intakes_company_preview_fk" FOREIGN KEY ("company_id","preview_id") REFERENCES "cargo_previews"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cargo_preview_email_intakes" ADD CONSTRAINT "cargo_preview_email_intakes_company_raw_object_fk" FOREIGN KEY ("company_id","raw_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_receiving_profiles" ADD CONSTRAINT "contractor_receiving_profiles_preview_inbound_token_hash_check" CHECK ("preview_inbound_token_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "contractor_receiving_profiles" ADD CONSTRAINT "contractor_receiving_profiles_preview_forwarder_allowlist_check" CHECK (cardinality("preview_forwarder_allowlist") between 1 and 20 and char_length(array_to_string("preview_forwarder_allowlist", '|')) <= 5100 and array_to_string("preview_forwarder_allowlist", '|') !~ '[[:cntrl:][:space:],<>]');--> statement-breakpoint
ALTER TABLE "contractor_receiving_profiles" ADD CONSTRAINT "contractor_receiving_profiles_preview_sender_allowlist_check" CHECK (cardinality("preview_sender_allowlist") between 1 and 20 and char_length(array_to_string("preview_sender_allowlist", '|')) <= 5100 and array_to_string("preview_sender_allowlist", '|') !~ '[[:cntrl:][:space:],<>]');--> statement-breakpoint
ALTER TABLE "contractor_receiving_profiles" ADD CONSTRAINT "contractor_receiving_profiles_preview_inbound_allowlists_check" CHECK ("preview_inbound_token_hash" is null or ("preview_forwarder_allowlist" is not null and "preview_sender_allowlist" is not null));--> statement-breakpoint
ALTER TABLE "cargo_previews" ADD CONSTRAINT "cargo_previews_uploader_check" CHECK (("source" = 'upload') = ("uploaded_by_user_id" is not null));--> statement-breakpoint
ALTER TABLE "cargo_previews" DROP CONSTRAINT "cargo_previews_source_check", ADD CONSTRAINT "cargo_previews_source_check" CHECK ("source" in ('email', 'upload'));
--> statement-breakpoint
CREATE FUNCTION "reject_cargo_preview_email_intakes_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'cargo_preview_email_intakes is append-only' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "cargo_preview_email_intakes_append_only_trigger"
BEFORE UPDATE OR DELETE ON "cargo_preview_email_intakes"
FOR EACH ROW
EXECUTE FUNCTION "reject_cargo_preview_email_intakes_mutation"();
