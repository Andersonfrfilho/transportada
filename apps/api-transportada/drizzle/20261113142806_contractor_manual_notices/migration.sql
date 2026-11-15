-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 324 T2 (D4): o registro do aviso manual à contratante, aditivo. Tabela nova `occurrence_contractor_manual_notices`
-- (quem clicou, quando, canal e desfecho), só inserção. Nada muda no aviso automático, nos tipos nem na reserva do
-- botão em `idempotency_records`.
CREATE TABLE "occurrence_contractor_manual_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"status" varchar(16) NOT NULL,
	"channel" varchar(24),
	"outcome" varchar(32),
	"reason" varchar(64),
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "occurrence_contractor_manual_notices_status_check" CHECK ("status" in ('sent', 'failed')),
	CONSTRAINT "occurrence_contractor_manual_notices_channel_check" CHECK ("channel" is null or "channel" in ('email', 'whatsapp_group', 'email_fallback')),
	CONSTRAINT "occurrence_contractor_manual_notices_sent_channel_check" CHECK ("status" <> 'sent' or "channel" is not null)
);
--> statement-breakpoint
CREATE INDEX "occurrence_contractor_manual_notices_occurrence_idx" ON "occurrence_contractor_manual_notices" ("company_id","occurrence_id","created_at");--> statement-breakpoint
ALTER TABLE "occurrence_contractor_manual_notices" ADD CONSTRAINT "occurrence_contractor_manual_notices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_contractor_manual_notices" ADD CONSTRAINT "occurrence_contractor_manual_notices_company_occurrence_fk" FOREIGN KEY ("company_id","occurrence_id") REFERENCES "trip_document_occurrences"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "occurrence_contractor_manual_notices" ADD CONSTRAINT "occurrence_contractor_manual_notices_actor_user_fk" FOREIGN KEY ("actor_user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;