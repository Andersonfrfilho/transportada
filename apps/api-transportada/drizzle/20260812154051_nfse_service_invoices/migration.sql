CREATE TABLE "nfse_emission_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"freight_rule_id" uuid NOT NULL,
	"taker" text NOT NULL,
	"charge_component_label" text NOT NULL,
	"municipality_ibge_code" text NOT NULL,
	"cnae_code" text NOT NULL,
	"service_list_item" text NOT NULL,
	"municipal_taxation_code" text DEFAULT '' NOT NULL,
	"nbs_code" text DEFAULT '' NOT NULL,
	"iss_rate" numeric(9,6) DEFAULT '0' NOT NULL,
	"iss_withheld" boolean DEFAULT false NOT NULL,
	"iss_exigibility" text DEFAULT '1' NOT NULL,
	"description_template" text NOT NULL,
	"description_max_length" bigint DEFAULT 2000 NOT NULL,
	"observations" text DEFAULT '' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfse_emission_profiles_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "nfse_emission_profiles_company_id_name_unique" UNIQUE("company_id","name"),
	CONSTRAINT "nfse_emission_profiles_status_check" CHECK ("status" in ('draft', 'active', 'inactive')),
	CONSTRAINT "nfse_emission_profiles_taker_check" CHECK ("taker" in ('0', '3')),
	CONSTRAINT "nfse_emission_profiles_iss_exigibility_check" CHECK ("iss_exigibility" in ('1', '2', '3', '4', '5', '6', '7')),
	CONSTRAINT "nfse_emission_profiles_iss_rate_check" CHECK ("iss_rate" >= 0 and "iss_rate" <= 1),
	CONSTRAINT "nfse_emission_profiles_municipality_check" CHECK ("municipality_ibge_code" ~ '^[0-9]{7}$'),
	CONSTRAINT "nfse_emission_profiles_cnae_check" CHECK ("cnae_code" ~ '^[0-9]{7}$'),
	CONSTRAINT "nfse_emission_profiles_description_max_length_check" CHECK ("description_max_length" between 200 and 5000),
	CONSTRAINT "nfse_emission_profiles_description_template_check" CHECK (length("description_template") > 0),
	CONSTRAINT "nfse_emission_profiles_service_list_item_check" CHECK (length("service_list_item") > 0),
	CONSTRAINT "nfse_emission_profiles_charge_component_label_check" CHECK (length("charge_component_label") > 0),
	CONSTRAINT "nfse_emission_profiles_name_check" CHECK (length("name") > 0),
	CONSTRAINT "nfse_emission_profiles_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE TABLE "nfse_fiscal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"provider_document_id" text NOT NULL,
	"fiscal_number" text NOT NULL,
	"verification_code" text DEFAULT '' NOT NULL,
	"fiscal_environment" text NOT NULL,
	"status" text NOT NULL,
	"xml_object_id" uuid NOT NULL,
	"xml_sha256" text NOT NULL,
	"pdf_object_id" uuid,
	"pdf_sha256" text,
	"authorized_at" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfse_fiscal_documents_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "nfse_fiscal_documents_company_invoice_unique" UNIQUE("company_id","invoice_id"),
	CONSTRAINT "nfse_fiscal_documents_company_provider_document_unique" UNIQUE("company_id","provider_document_id"),
	CONSTRAINT "nfse_fiscal_documents_status_check" CHECK ("status" in ('authorized', 'cancelled')),
	CONSTRAINT "nfse_fiscal_documents_environment_check" CHECK ("fiscal_environment" in ('homologation', 'production')),
	CONSTRAINT "nfse_fiscal_documents_sha256_check" CHECK ("xml_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "nfse_fiscal_documents_pdf_check" CHECK (("pdf_object_id" is null) = ("pdf_sha256" is null) and ("pdf_sha256" is null or "pdf_sha256" ~ '^[0-9a-f]{64}$')),
	CONSTRAINT "nfse_fiscal_documents_cancelled_state_check" CHECK ("status" <> 'cancelled' or "cancelled_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "nfse_issuance_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"attempt_kind" text NOT NULL,
	"attempt_number" bigint NOT NULL,
	"status" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"idempotency_fingerprint" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"fiscal_environment" text NOT NULL,
	"last_error_code" text,
	"last_error_cause" text,
	"last_error_message" text,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfse_issuance_attempts_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "nfse_issuance_attempts_company_idempotency_key_unique" UNIQUE("company_id","idempotency_key"),
	CONSTRAINT "nfse_issuance_attempts_company_invoice_kind_fingerprint_unique" UNIQUE("company_id","invoice_id","attempt_kind","request_fingerprint"),
	CONSTRAINT "nfse_issuance_attempts_kind_check" CHECK ("attempt_kind" in ('issue', 'cancel')),
	CONSTRAINT "nfse_issuance_attempts_status_check" CHECK ("status" in ('pending', 'in_flight', 'accepted', 'authorized', 'rejected', 'retry_scheduled', 'failed', 'reconciliation_required', 'cancelled')),
	CONSTRAINT "nfse_issuance_attempts_environment_check" CHECK ("fiscal_environment" in ('homologation', 'production')),
	CONSTRAINT "nfse_issuance_attempts_attempt_number_check" CHECK ("attempt_number" > 0),
	CONSTRAINT "nfse_issuance_attempts_idempotency_key_check" CHECK (length("idempotency_key") > 0),
	CONSTRAINT "nfse_issuance_attempts_request_fingerprint_check" CHECK (length("request_fingerprint") > 0)
);
--> statement-breakpoint
CREATE TABLE "nfse_issuance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfse_issuance_events_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "nfse_issuance_events_name_check" CHECK ("event_name" in ('issue_requested', 'cancel_requested', 'in_flight', 'accepted', 'authorized', 'rejected', 'failed', 'retry_scheduled', 'reconciliation_required', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "nfse_issuance_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"event_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_subtype" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"attempt_kind" text NOT NULL,
	"status" text NOT NULL,
	"event_type" text NOT NULL,
	"event_version" bigint NOT NULL,
	"attempt_fingerprint" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"correlation_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"claim_owner" text,
	"claim_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfse_issuance_outbox_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "nfse_issuance_outbox_company_id_event_id_unique" UNIQUE("company_id","event_id"),
	CONSTRAINT "nfse_issuance_outbox_attempt_kind_check" CHECK ("attempt_kind" in ('issue', 'cancel')),
	CONSTRAINT "nfse_issuance_outbox_status_check" CHECK ("status" in ('requested', 'retry_scheduled')),
	CONSTRAINT "nfse_issuance_outbox_event_type_check" CHECK ("event_type" in ('transportada.nfse.invoice.issue.requested', 'transportada.nfse.invoice.cancel.requested')),
	CONSTRAINT "nfse_issuance_outbox_event_version_check" CHECK ("event_version" > 0),
	CONSTRAINT "nfse_issuance_outbox_claim_check" CHECK (("claim_owner" is null) = ("claim_expires_at" is null))
);
--> statement-breakpoint
CREATE TABLE "nfse_issuance_payloads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"provider_config" jsonb NOT NULL,
	"payload_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfse_issuance_payloads_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "nfse_issuance_payloads_company_attempt_unique" UNIQUE("company_id","attempt_id"),
	CONSTRAINT "nfse_issuance_payloads_sha256_check" CHECK ("payload_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "nfse_processed_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"consumer_name" text NOT NULL,
	"event_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"result" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfse_processed_messages_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "nfse_processed_messages_company_consumer_event_unique" UNIQUE("company_id","consumer_name","event_id")
);
--> statement-breakpoint
CREATE TABLE "nfse_provider_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"provider" text DEFAULT 'notarp' NOT NULL,
	"fiscal_environment" text NOT NULL,
	"tax_id" text NOT NULL,
	"municipal_registration" text DEFAULT '' NOT NULL,
	"secret_envelope" jsonb NOT NULL,
	"callback_token_sha256" text NOT NULL CONSTRAINT "nfse_provider_credentials_callback_token_sha256_unique" UNIQUE,
	"status" text DEFAULT 'active' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfse_provider_credentials_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "nfse_provider_credentials_company_provider_environment_unique" UNIQUE("company_id","provider","fiscal_environment"),
	CONSTRAINT "nfse_provider_credentials_provider_check" CHECK ("provider" in ('notarp')),
	CONSTRAINT "nfse_provider_credentials_environment_check" CHECK ("fiscal_environment" in ('homologation', 'production')),
	CONSTRAINT "nfse_provider_credentials_status_check" CHECK ("status" in ('active', 'inactive')),
	CONSTRAINT "nfse_provider_credentials_tax_id_check" CHECK ("tax_id" ~ '^[0-9]{14}$'),
	CONSTRAINT "nfse_provider_credentials_callback_token_check" CHECK ("callback_token_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "nfse_provider_credentials_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE TABLE "nfse_service_invoice_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"ordinal" bigint NOT NULL,
	"label" text NOT NULL,
	"calculation_type" text NOT NULL,
	"rate" numeric(9,6),
	"base_amount" numeric(19,4) NOT NULL,
	"amount" numeric(19,4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfse_service_invoice_charges_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "nfse_service_invoice_charges_company_invoice_ordinal_unique" UNIQUE("company_id","invoice_id","ordinal"),
	CONSTRAINT "nfse_service_invoice_charges_calculation_type_check" CHECK ("calculation_type" in ('percentage_of_cargo', 'percentage_of_freight', 'fixed_amount')),
	CONSTRAINT "nfse_service_invoice_charges_value_coherence_check" CHECK (case when "calculation_type" = 'fixed_amount' then "rate" is null else "rate" is not null end),
	CONSTRAINT "nfse_service_invoice_charges_rate_check" CHECK ("rate" is null or ("rate" >= 0 and "rate" <= 1)),
	CONSTRAINT "nfse_service_invoice_charges_amount_check" CHECK ("amount" >= 0 and "base_amount" >= 0),
	CONSTRAINT "nfse_service_invoice_charges_ordinal_check" CHECK ("ordinal" > 0),
	CONSTRAINT "nfse_service_invoice_charges_label_check" CHECK (length("label") > 0)
);
--> statement-breakpoint
CREATE TABLE "nfse_service_invoice_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"nfe_document_id" uuid NOT NULL,
	"position" bigint NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfse_service_invoice_documents_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "nfse_service_invoice_documents_company_invoice_position_unique" UNIQUE("company_id","invoice_id","position"),
	CONSTRAINT "nfse_service_invoice_documents_position_check" CHECK ("position" > 0)
);
--> statement-breakpoint
CREATE TABLE "nfse_service_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"emission_profile_id" uuid NOT NULL,
	"taker_tax_id" text NOT NULL,
	"taker_legal_name" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"service_amount" numeric(19,4) NOT NULL,
	"iss_amount" numeric(19,4) DEFAULT '0' NOT NULL,
	"description" text NOT NULL,
	"calculation_snapshot" jsonb NOT NULL,
	"provider_document_id" text,
	"provider_number" text,
	"verification_code" text,
	"rejection_code" text,
	"rejection_message" text,
	"next_status_check_at" timestamp with time zone,
	"authorized_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfse_service_invoices_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "nfse_service_invoices_status_check" CHECK ("status" in ('requested', 'issuing', 'pending_authorization', 'authorized', 'cancellation_requested', 'rejected', 'cancelled', 'failed')),
	CONSTRAINT "nfse_service_invoices_taker_tax_id_check" CHECK ("taker_tax_id" ~ '^[0-9]{11}$|^[0-9]{14}$'),
	CONSTRAINT "nfse_service_invoices_amount_check" CHECK ("service_amount" >= 0 and "iss_amount" >= 0),
	CONSTRAINT "nfse_service_invoices_description_check" CHECK (length("description") > 0),
	CONSTRAINT "nfse_service_invoices_authorized_check" CHECK ("status" <> 'authorized' or ("provider_document_id" is not null and "authorized_at" is not null)),
	CONSTRAINT "nfse_service_invoices_rejected_check" CHECK ("status" <> 'rejected' or ("rejection_code" is not null and "rejection_message" is not null)),
	CONSTRAINT "nfse_service_invoices_cancelled_check" CHECK ("status" <> 'cancelled' or ("cancelled_at" is not null and "cancellation_reason" is not null)),
	CONSTRAINT "nfse_service_invoices_cancellation_requested_check" CHECK ("status" <> 'cancellation_requested' or ("cancellation_reason" is not null and "cancelled_at" is null)),
	CONSTRAINT "nfse_service_invoices_next_check_state_check" CHECK ("status" in ('pending_authorization', 'cancellation_requested') or "next_status_check_at" is null),
	CONSTRAINT "nfse_service_invoices_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
ALTER TABLE "company_fiscal_profiles" ADD COLUMN "nfse_retry_max_attempts" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_fiscal_profiles" ADD COLUMN "nfse_retry_backoff_seconds" integer[] DEFAULT '{30,120,600,1800}'::integer[] NOT NULL;--> statement-breakpoint
CREATE INDEX "nfse_emission_profiles_company_status_name_idx" ON "nfse_emission_profiles" ("company_id","status","name");--> statement-breakpoint
CREATE INDEX "nfse_issuance_attempts_company_status_created_at_idx" ON "nfse_issuance_attempts" ("company_id","status","created_at");--> statement-breakpoint
CREATE INDEX "nfse_issuance_events_company_invoice_created_at_idx" ON "nfse_issuance_events" ("company_id","invoice_id","created_at");--> statement-breakpoint
CREATE INDEX "nfse_issuance_outbox_company_published_next_attempt_created_idx" ON "nfse_issuance_outbox" ("company_id","published_at","next_attempt_at","created_at");--> statement-breakpoint
CREATE INDEX "nfse_issuance_payloads_company_invoice_created_at_idx" ON "nfse_issuance_payloads" ("company_id","invoice_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "nfse_service_invoice_documents_active_nfe_unique" ON "nfse_service_invoice_documents" ("company_id","nfe_document_id") WHERE "cancelled_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "nfse_service_invoices_company_provider_document_unique" ON "nfse_service_invoices" ("company_id","provider_document_id") WHERE "provider_document_id" is not null;--> statement-breakpoint
CREATE INDEX "nfse_service_invoices_company_status_next_check_idx" ON "nfse_service_invoices" ("company_id","status","next_status_check_at");--> statement-breakpoint
CREATE INDEX "nfse_service_invoices_company_created_at_idx" ON "nfse_service_invoices" ("company_id","created_at");--> statement-breakpoint
ALTER TABLE "nfse_emission_profiles" ADD CONSTRAINT "nfse_emission_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_emission_profiles" ADD CONSTRAINT "nfse_emission_profiles_company_freight_rule_fk" FOREIGN KEY ("company_id","freight_rule_id") REFERENCES "freight_rules"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_emission_profiles" ADD CONSTRAINT "nfse_emission_profiles_author_membership_fk" FOREIGN KEY ("created_by_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_fiscal_documents" ADD CONSTRAINT "nfse_fiscal_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_fiscal_documents" ADD CONSTRAINT "nfse_fiscal_documents_company_invoice_fk" FOREIGN KEY ("company_id","invoice_id") REFERENCES "nfse_service_invoices"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_fiscal_documents" ADD CONSTRAINT "nfse_fiscal_documents_company_attempt_fk" FOREIGN KEY ("company_id","attempt_id") REFERENCES "nfse_issuance_attempts"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_fiscal_documents" ADD CONSTRAINT "nfse_fiscal_documents_company_xml_object_fk" FOREIGN KEY ("company_id","xml_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_fiscal_documents" ADD CONSTRAINT "nfse_fiscal_documents_company_pdf_object_fk" FOREIGN KEY ("company_id","pdf_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_issuance_attempts" ADD CONSTRAINT "nfse_issuance_attempts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_issuance_attempts" ADD CONSTRAINT "nfse_issuance_attempts_company_invoice_fk" FOREIGN KEY ("company_id","invoice_id") REFERENCES "nfse_service_invoices"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_issuance_events" ADD CONSTRAINT "nfse_issuance_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_issuance_events" ADD CONSTRAINT "nfse_issuance_events_company_attempt_fk" FOREIGN KEY ("company_id","attempt_id") REFERENCES "nfse_issuance_attempts"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_issuance_events" ADD CONSTRAINT "nfse_issuance_events_company_invoice_fk" FOREIGN KEY ("company_id","invoice_id") REFERENCES "nfse_service_invoices"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_issuance_outbox" ADD CONSTRAINT "nfse_issuance_outbox_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_issuance_outbox" ADD CONSTRAINT "nfse_issuance_outbox_company_aggregate_fk" FOREIGN KEY ("company_id","aggregate_id") REFERENCES "nfse_service_invoices"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_issuance_outbox" ADD CONSTRAINT "nfse_issuance_outbox_company_invoice_fk" FOREIGN KEY ("company_id","invoice_id") REFERENCES "nfse_service_invoices"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_issuance_outbox" ADD CONSTRAINT "nfse_issuance_outbox_company_attempt_fk" FOREIGN KEY ("company_id","attempt_id") REFERENCES "nfse_issuance_attempts"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_issuance_outbox" ADD CONSTRAINT "nfse_issuance_outbox_actor_membership_fk" FOREIGN KEY ("actor_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_issuance_payloads" ADD CONSTRAINT "nfse_issuance_payloads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_issuance_payloads" ADD CONSTRAINT "nfse_issuance_payloads_company_invoice_fk" FOREIGN KEY ("company_id","invoice_id") REFERENCES "nfse_service_invoices"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_issuance_payloads" ADD CONSTRAINT "nfse_issuance_payloads_company_attempt_fk" FOREIGN KEY ("company_id","attempt_id") REFERENCES "nfse_issuance_attempts"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_processed_messages" ADD CONSTRAINT "nfse_processed_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_provider_credentials" ADD CONSTRAINT "nfse_provider_credentials_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_service_invoice_charges" ADD CONSTRAINT "nfse_service_invoice_charges_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_service_invoice_charges" ADD CONSTRAINT "nfse_service_invoice_charges_company_invoice_fk" FOREIGN KEY ("company_id","invoice_id") REFERENCES "nfse_service_invoices"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_service_invoice_documents" ADD CONSTRAINT "nfse_service_invoice_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_service_invoice_documents" ADD CONSTRAINT "nfse_service_invoice_documents_company_invoice_fk" FOREIGN KEY ("company_id","invoice_id") REFERENCES "nfse_service_invoices"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_service_invoice_documents" ADD CONSTRAINT "nfse_service_invoice_documents_company_nfe_document_fk" FOREIGN KEY ("company_id","nfe_document_id") REFERENCES "nfe_documents"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_service_invoices" ADD CONSTRAINT "nfse_service_invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_service_invoices" ADD CONSTRAINT "nfse_service_invoices_company_profile_fk" FOREIGN KEY ("company_id","emission_profile_id") REFERENCES "nfse_emission_profiles"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfse_service_invoices" ADD CONSTRAINT "nfse_service_invoices_author_membership_fk" FOREIGN KEY ("created_by_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_fiscal_profiles" ADD CONSTRAINT "company_fiscal_profiles_nfse_retry_backoff_check" CHECK (array_length("nfse_retry_backoff_seconds", 1) between 1 and 10 and 0 < all("nfse_retry_backoff_seconds"));--> statement-breakpoint
ALTER TABLE "company_fiscal_profiles" ADD CONSTRAINT "company_fiscal_profiles_nfse_retry_max_attempts_check" CHECK ("nfse_retry_max_attempts" between 1 and 10);--> statement-breakpoint
ALTER TABLE "stored_objects" DROP CONSTRAINT "stored_objects_purpose_check", ADD CONSTRAINT "stored_objects_purpose_check" CHECK ("purpose" in ('import_source', 'nfe_document', 'nfe_event', 'billing_document', 'cte_document', 'mdfe_document', 'nfse_document'));