-- A prévia congelada do comando pelo WhatsApp e o diário de passos da confirmação (spec 144 T011).
--
-- Aditiva: duas tabelas novas, nenhuma linha existente muda. O diário só alcança o pedido dentro da
-- mesma empresa, pela FK composta (company_id, request_id).
CREATE TABLE "whatsapp_command_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"document_kind" text NOT NULL,
	"group_key" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"document_id" uuid,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_command_documents_request_kind_group_unique" UNIQUE("request_id","document_kind","group_key"),
	CONSTRAINT "whatsapp_command_documents_document_kind_check" CHECK ("document_kind" in ('cte_batch', 'nfse_invoice', 'billing_invoice')),
	CONSTRAINT "whatsapp_command_documents_status_check" CHECK ("status" in ('pending', 'created', 'issued', 'failed')),
	CONSTRAINT "whatsapp_command_documents_idempotency_key_check" CHECK ("idempotency_key" ~ '^[A-Za-z0-9._:-]+$' and length("idempotency_key") between 16 and 256),
	CONSTRAINT "whatsapp_command_documents_document_id_check" CHECK ("status" not in ('created', 'issued') or "document_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "whatsapp_command_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"selection" jsonb NOT NULL,
	"classification" jsonb NOT NULL,
	"preview_sha256" text NOT NULL,
	"due_date" date,
	"period" text,
	"grouping_mode" text,
	"status" text DEFAULT 'previewed' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"settlement_outcome" text,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_command_requests_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "whatsapp_command_requests_kind_check" CHECK ("kind" in ('document_issuance')),
	CONSTRAINT "whatsapp_command_requests_status_check" CHECK ("status" in ('previewed', 'confirming', 'dispatched', 'settled', 'settled_partial', 'expired', 'superseded')),
	CONSTRAINT "whatsapp_command_requests_grouping_mode_check" CHECK ("grouping_mode" is null or "grouping_mode" in ('per_invoice', 'sender_recipient')),
	CONSTRAINT "whatsapp_command_requests_preview_sha256_check" CHECK ("preview_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "whatsapp_command_requests_period_check" CHECK ("period" is null or length("period") <= 60),
	CONSTRAINT "whatsapp_command_requests_selection_check" CHECK (jsonb_typeof("selection") = 'array'),
	CONSTRAINT "whatsapp_command_requests_classification_check" CHECK (jsonb_typeof("classification") = 'array'),
	CONSTRAINT "whatsapp_command_requests_expires_at_check" CHECK ("expires_at" > "created_at"),
	CONSTRAINT "whatsapp_command_requests_confirmed_at_check" CHECK ("status" not in ('confirming', 'dispatched', 'settled', 'settled_partial') or "confirmed_at" is not null),
	CONSTRAINT "whatsapp_command_requests_settled_at_check" CHECK ("status" not in ('settled', 'settled_partial') or "settled_at" is not null)
);
--> statement-breakpoint
CREATE INDEX "whatsapp_command_requests_company_id_status_idx" ON "whatsapp_command_requests" ("company_id","status");--> statement-breakpoint
CREATE INDEX "whatsapp_command_requests_in_flight_idx" ON "whatsapp_command_requests" ("status","confirmed_at") WHERE "status" in ('dispatched', 'confirming');--> statement-breakpoint
ALTER TABLE "whatsapp_command_documents" ADD CONSTRAINT "whatsapp_command_documents_request_fk" FOREIGN KEY ("company_id","request_id") REFERENCES "whatsapp_command_requests"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "whatsapp_command_requests" ADD CONSTRAINT "whatsapp_command_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "whatsapp_command_requests" ADD CONSTRAINT "whatsapp_command_requests_actor_membership_fk" FOREIGN KEY ("actor_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "whatsapp_command_requests" ADD CONSTRAINT "whatsapp_command_requests_membership_fk" FOREIGN KEY ("membership_id","company_id") REFERENCES "user_company_memberships"("id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;