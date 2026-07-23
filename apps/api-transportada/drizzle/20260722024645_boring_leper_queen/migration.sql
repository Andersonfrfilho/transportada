CREATE TABLE "nfe_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"street" text,
	"number" text,
	"complement" text,
	"district" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"country_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nfe_distribution_cursors" (
	"company_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"ult_nsu" text DEFAULT '000000000000000' NOT NULL,
	"max_nsu" text DEFAULT '000000000000000' NOT NULL,
	"next_allowed_at" timestamp with time zone,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfe_distribution_cursors_company_environment_pk" PRIMARY KEY("company_id","environment"),
	CONSTRAINT "nfe_distribution_cursors_environment_check" CHECK ("environment" in ('homologation', 'production')),
	CONSTRAINT "nfe_distribution_cursors_ult_nsu_check" CHECK ("ult_nsu" ~ '^[0-9]{15}$'),
	CONSTRAINT "nfe_distribution_cursors_max_nsu_check" CHECK ("max_nsu" ~ '^[0-9]{15}$'),
	CONSTRAINT "nfe_distribution_cursors_monotonic_check" CHECK ("ult_nsu"::numeric <= "max_nsu"::numeric),
	CONSTRAINT "nfe_distribution_cursors_version_check" CHECK ("version" > 0),
	CONSTRAINT "nfe_distribution_cursors_lease_check" CHECK (("lease_owner" is null) = ("lease_expires_at" is null))
);
--> statement-breakpoint
CREATE TABLE "nfe_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"access_key" text NOT NULL,
	"model" text NOT NULL,
	"number" text NOT NULL,
	"series" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"operation_nature" text NOT NULL,
	"operation_type" text NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"total_value" numeric(19,4) NOT NULL,
	"products_value" numeric(19,4) NOT NULL,
	"freight_value" numeric(19,4) DEFAULT '0',
	"insurance_value" numeric(19,4) DEFAULT '0',
	"discount_value" numeric(19,4) DEFAULT '0',
	"other_expenses_value" numeric(19,4) DEFAULT '0',
	"additional_information" text,
	"authorization_protocol" text NOT NULL,
	"xml_object_id" uuid NOT NULL,
	"xml_sha256" text NOT NULL,
	"import_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfe_documents_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "nfe_documents_company_id_access_key_unique" UNIQUE("company_id","access_key"),
	CONSTRAINT "nfe_documents_access_key_check" CHECK ("access_key" ~ '^[0-9]{44}$'),
	CONSTRAINT "nfe_documents_model_check" CHECK ("model" = '55'),
	CONSTRAINT "nfe_documents_number_check" CHECK ("number" ~ '^[0-9]{1,9}$'),
	CONSTRAINT "nfe_documents_series_check" CHECK ("series" ~ '^[0-9]{1,3}$'),
	CONSTRAINT "nfe_documents_operation_type_check" CHECK ("operation_type" in ('0', '1')),
	CONSTRAINT "nfe_documents_status_check" CHECK ("status" in ('authorized', 'cancelled', 'denied')),
	CONSTRAINT "nfe_documents_source_check" CHECK ("source" in ('upload', 'distribution')),
	CONSTRAINT "nfe_documents_values_check" CHECK ("total_value" >= 0 and "products_value" >= 0 and "freight_value" >= 0 and "insurance_value" >= 0 and "discount_value" >= 0 and "other_expenses_value" >= 0),
	CONSTRAINT "nfe_documents_sha256_check" CHECK ("xml_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "nfe_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"target_access_key" text NOT NULL,
	"event_type" text NOT NULL,
	"event_sequence" bigint NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"xml_object_id" uuid NOT NULL,
	"source_nsu" text,
	"environment" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfe_events_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "nfe_events_company_access_key_type_sequence_unique" UNIQUE("company_id","target_access_key","event_type","event_sequence"),
	CONSTRAINT "nfe_events_access_key_check" CHECK ("target_access_key" ~ '^[0-9]{44}$'),
	CONSTRAINT "nfe_events_sequence_check" CHECK ("event_sequence" > 0),
	CONSTRAINT "nfe_events_distribution_source_presence_check" CHECK (("source_nsu" is null) = ("environment" is null)),
	CONSTRAINT "nfe_events_source_nsu_check" CHECK ("source_nsu" is null or "source_nsu" ~ '^[0-9]{15}$'),
	CONSTRAINT "nfe_events_environment_check" CHECK ("environment" is null or "environment" in ('homologation', 'production'))
);
--> statement-breakpoint
CREATE TABLE "nfe_import_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"import_id" uuid NOT NULL,
	"previous_item_id" uuid,
	"previous_attempt" bigint,
	"ordinal" bigint NOT NULL,
	"source_name" text NOT NULL,
	"source_object_id" uuid NOT NULL,
	"source_sha256" text NOT NULL,
	"source_entry" text NOT NULL,
	"variant" text,
	"access_key" text,
	"source_nsu" text,
	"environment" text,
	"status" text NOT NULL,
	"attempt" bigint DEFAULT 1 NOT NULL,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfe_import_items_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "nfe_import_items_company_id_import_id_ordinal_unique" UNIQUE("company_id","import_id","ordinal"),
	CONSTRAINT "nfe_import_items_company_id_import_id_source_replay_unique" UNIQUE("company_id","import_id","source_sha256","source_entry"),
	CONSTRAINT "nfe_import_items_lineage_target_unique" UNIQUE("company_id","id","source_object_id","source_sha256","source_entry","attempt"),
	CONSTRAINT "nfe_import_items_ordinal_check" CHECK ("ordinal" > 0),
	CONSTRAINT "nfe_import_items_attempt_check" CHECK ("attempt" > 0),
	CONSTRAINT "nfe_import_items_sha256_check" CHECK ("source_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "nfe_import_items_status_check" CHECK ("status" in ('pending', 'validating', 'imported', 'duplicated', 'invalid', 'rejected', 'failed')),
	CONSTRAINT "nfe_import_items_variant_check" CHECK ("variant" is null or "variant" in ('complete', 'summary', 'event')),
	CONSTRAINT "nfe_import_items_access_key_check" CHECK ("access_key" is null or "access_key" ~ '^[0-9]{44}$'),
	CONSTRAINT "nfe_import_items_distribution_source_presence_check" CHECK (("source_nsu" is null) = ("environment" is null)),
	CONSTRAINT "nfe_import_items_source_nsu_check" CHECK ("source_nsu" is null or "source_nsu" ~ '^[0-9]{15}$'),
	CONSTRAINT "nfe_import_items_environment_check" CHECK ("environment" is null or "environment" in ('homologation', 'production')),
	CONSTRAINT "nfe_import_items_attempt_history_check" CHECK (("attempt" = 1 and "previous_item_id" is null and "previous_attempt" is null) or ("attempt" > 1 and "previous_item_id" is not null and "previous_attempt" is not null and "attempt" = "previous_attempt" + 1)),
	CONSTRAINT "nfe_import_items_previous_item_check" CHECK ("previous_item_id" is null or "previous_item_id" <> "id")
);
--> statement-breakpoint
CREATE TABLE "nfe_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"source" text NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"correlation_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"status" text NOT NULL,
	"received_count" bigint DEFAULT 0 NOT NULL,
	"processed_count" bigint DEFAULT 0 NOT NULL,
	"imported_count" bigint DEFAULT 0 NOT NULL,
	"duplicated_count" bigint DEFAULT 0 NOT NULL,
	"invalid_count" bigint DEFAULT 0 NOT NULL,
	"rejected_count" bigint DEFAULT 0 NOT NULL,
	"failed_count" bigint DEFAULT 0 NOT NULL,
	"terminal_error" jsonb,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfe_imports_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "nfe_imports_company_id_idempotency_key_unique" UNIQUE("company_id","idempotency_key"),
	CONSTRAINT "nfe_imports_source_check" CHECK ("source" in ('upload', 'distribution')),
	CONSTRAINT "nfe_imports_status_check" CHECK ("status" in ('pending', 'queued', 'processing', 'completed', 'partially_processed', 'failed', 'cancelled')),
	CONSTRAINT "nfe_imports_counters_check" CHECK ("received_count" >= 0 and "processed_count" >= 0 and "imported_count" >= 0 and "duplicated_count" >= 0 and "invalid_count" >= 0 and "rejected_count" >= 0 and "failed_count" >= 0 and "processed_count" <= "received_count" and "processed_count" = "imported_count" + "duplicated_count" + "invalid_count" + "rejected_count" + "failed_count"),
	CONSTRAINT "nfe_imports_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE TABLE "nfe_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"role" text NOT NULL,
	"tax_id" text,
	"legal_name" text,
	"state_registration" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfe_participants_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "nfe_participants_company_document_role_unique" UNIQUE("company_id","document_id","role")
);
--> statement-breakpoint
CREATE TABLE "nfe_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"ordinal" bigint NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"ncm" text NOT NULL,
	"cfop" text NOT NULL,
	"commercial_unit" text NOT NULL,
	"quantity" numeric(19,4) NOT NULL,
	"unit_value" numeric(19,4) NOT NULL,
	"total_value" numeric(19,4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfe_products_values_check" CHECK ("ordinal" > 0 and "quantity" >= 0 and "unit_value" >= 0 and "total_value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "nfe_volumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"ordinal" bigint NOT NULL,
	"quantity" numeric(19,4) DEFAULT '0',
	"species" text,
	"gross_weight" numeric(19,4) DEFAULT '0',
	"net_weight" numeric(19,4) DEFAULT '0',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfe_volumes_values_check" CHECK ("ordinal" > 0 and "quantity" >= 0 and "gross_weight" >= 0 and "net_weight" >= 0)
);
--> statement-breakpoint
CREATE TABLE "processed_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"consumer_name" text NOT NULL,
	"event_id" uuid NOT NULL,
	"result" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_messages_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "processed_messages_company_consumer_event_unique" UNIQUE("company_id","consumer_name","event_id")
);
--> statement-breakpoint
CREATE TABLE "processing_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"event_version" bigint NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"correlation_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempt" bigint DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claim_owner" text,
	"claim_expires_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processing_outbox_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "processing_outbox_company_id_event_id_unique" UNIQUE("company_id","event_id"),
	CONSTRAINT "processing_outbox_attempt_check" CHECK ("attempt" >= 0),
	CONSTRAINT "processing_outbox_event_version_check" CHECK ("event_version" > 0),
	CONSTRAINT "processing_outbox_aggregate_type_check" CHECK ("aggregate_type" = 'nfe_import'),
	CONSTRAINT "processing_outbox_event_type_check" CHECK ("event_type" in ('transportada.nfe.import.requested', 'transportada.nfe.distribution.requested')),
	CONSTRAINT "processing_outbox_claim_check" CHECK (("claim_owner" is null) = ("claim_expires_at" is null))
);
--> statement-breakpoint
CREATE TABLE "stored_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"status" text NOT NULL,
	"purpose" text NOT NULL,
	"retention_until" timestamp with time zone,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stored_objects_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "stored_objects_company_provider_bucket_key_unique" UNIQUE("company_id","provider","bucket","object_key"),
	CONSTRAINT "stored_objects_size_check" CHECK ("size_bytes" >= 0),
	CONSTRAINT "stored_objects_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "stored_objects_status_check" CHECK ("status" in ('staging', 'final', 'deleted')),
	CONSTRAINT "stored_objects_purpose_check" CHECK ("purpose" in ('import_source', 'nfe_document', 'nfe_event')),
	CONSTRAINT "stored_objects_lease_check" CHECK (("lease_owner" is null) = ("lease_expires_at" is null)),
	CONSTRAINT "stored_objects_deleted_check" CHECK (("status" = 'deleted') = ("deleted_at" is not null)),
	CONSTRAINT "stored_objects_final_lease_check" CHECK ("status" <> 'final' or ("lease_owner" is null and "lease_expires_at" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "nfe_events_company_environment_source_nsu_unique" ON "nfe_events" ("company_id","environment","source_nsu") WHERE "source_nsu" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "nfe_import_items_company_environment_source_nsu_unique" ON "nfe_import_items" ("company_id","environment","source_nsu") WHERE "source_nsu" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "nfe_import_items_company_previous_item_unique" ON "nfe_import_items" ("company_id","previous_item_id") WHERE "previous_item_id" is not null;--> statement-breakpoint
CREATE INDEX "processing_outbox_company_published_next_attempt_created_idx" ON "processing_outbox" ("company_id","published_at","next_attempt_at","created_at");--> statement-breakpoint
CREATE INDEX "stored_objects_company_status_lease_expires_idx" ON "stored_objects" ("company_id","status","lease_expires_at");--> statement-breakpoint
ALTER TABLE "nfe_addresses" ADD CONSTRAINT "nfe_addresses_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_addresses" ADD CONSTRAINT "nfe_addresses_company_participant_fk" FOREIGN KEY ("company_id","participant_id") REFERENCES "nfe_participants"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_distribution_cursors" ADD CONSTRAINT "nfe_distribution_cursors_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_documents" ADD CONSTRAINT "nfe_documents_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_documents" ADD CONSTRAINT "nfe_documents_created_by_user_id_identity_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_documents" ADD CONSTRAINT "nfe_documents_company_xml_object_fk" FOREIGN KEY ("company_id","xml_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_documents" ADD CONSTRAINT "nfe_documents_company_import_fk" FOREIGN KEY ("company_id","import_id") REFERENCES "nfe_imports"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_documents" ADD CONSTRAINT "nfe_documents_created_by_membership_fk" FOREIGN KEY ("created_by_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_events" ADD CONSTRAINT "nfe_events_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_events" ADD CONSTRAINT "nfe_events_company_xml_object_fk" FOREIGN KEY ("company_id","xml_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_import_items" ADD CONSTRAINT "nfe_import_items_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_import_items" ADD CONSTRAINT "nfe_import_items_company_import_fk" FOREIGN KEY ("company_id","import_id") REFERENCES "nfe_imports"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_import_items" ADD CONSTRAINT "nfe_import_items_company_source_object_fk" FOREIGN KEY ("company_id","source_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_import_items" ADD CONSTRAINT "nfe_import_items_lineage_fk" FOREIGN KEY ("company_id","previous_item_id","source_object_id","source_sha256","source_entry","previous_attempt") REFERENCES "nfe_import_items"("company_id","id","source_object_id","source_sha256","source_entry","attempt") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_imports" ADD CONSTRAINT "nfe_imports_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_imports" ADD CONSTRAINT "nfe_imports_requested_by_membership_fk" FOREIGN KEY ("requested_by_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_participants" ADD CONSTRAINT "nfe_participants_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_participants" ADD CONSTRAINT "nfe_participants_company_document_fk" FOREIGN KEY ("company_id","document_id") REFERENCES "nfe_documents"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_products" ADD CONSTRAINT "nfe_products_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_products" ADD CONSTRAINT "nfe_products_company_document_fk" FOREIGN KEY ("company_id","document_id") REFERENCES "nfe_documents"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_volumes" ADD CONSTRAINT "nfe_volumes_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "nfe_volumes" ADD CONSTRAINT "nfe_volumes_company_document_fk" FOREIGN KEY ("company_id","document_id") REFERENCES "nfe_documents"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "processed_messages" ADD CONSTRAINT "processed_messages_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "processed_messages" ADD CONSTRAINT "processed_messages_company_event_fk" FOREIGN KEY ("company_id","event_id") REFERENCES "processing_outbox"("company_id","event_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "processing_outbox" ADD CONSTRAINT "processing_outbox_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "processing_outbox" ADD CONSTRAINT "processing_outbox_company_aggregate_fk" FOREIGN KEY ("company_id","aggregate_id") REFERENCES "nfe_imports"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "processing_outbox" ADD CONSTRAINT "processing_outbox_actor_membership_fk" FOREIGN KEY ("actor_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "stored_objects" ADD CONSTRAINT "stored_objects_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
