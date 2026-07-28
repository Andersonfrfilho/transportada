CREATE TABLE "mdfe_fiscal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"manifest_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"access_key" text NOT NULL,
	"authorization_protocol" text NOT NULL,
	"fiscal_environment" text NOT NULL,
	"fiscal_series" text NOT NULL,
	"fiscal_number" bigint NOT NULL,
	"status" text NOT NULL,
	"xml_object_id" uuid NOT NULL,
	"xml_sha256" text NOT NULL,
	"authorized_at" timestamp with time zone,
	"closure_protocol" text,
	"closure_state" text,
	"closure_city_code" text,
	"closure_xml_object_id" uuid,
	"closure_xml_sha256" text,
	"closed_at" timestamp with time zone,
	"cancellation_justification" text,
	"cancellation_requested_at" timestamp with time zone,
	"cancellation_protocol" text,
	"cancellation_xml_object_id" uuid,
	"cancellation_xml_sha256" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mdfe_fiscal_documents_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "mdfe_fiscal_documents_company_access_key_unique" UNIQUE("company_id","access_key"),
	CONSTRAINT "mdfe_fiscal_documents_company_manifest_unique" UNIQUE("company_id","manifest_id"),
	CONSTRAINT "mdfe_fiscal_documents_access_key_check" CHECK ("access_key" ~ '^[0-9]{44}$'),
	CONSTRAINT "mdfe_fiscal_documents_status_check" CHECK ("status" in ('authorized', 'closed', 'cancelled')),
	CONSTRAINT "mdfe_fiscal_documents_environment_check" CHECK ("fiscal_environment" in ('homologation', 'production')),
	CONSTRAINT "mdfe_fiscal_documents_sha256_check" CHECK ("xml_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "mdfe_fiscal_documents_closure_city_code_check" CHECK ("closure_city_code" is null or "closure_city_code" ~ '^[0-9]{7}$'),
	CONSTRAINT "mdfe_fiscal_documents_closure_state_check" CHECK ("closure_state" is null or "closure_state" ~ '^[A-Z]{2}$'),
	CONSTRAINT "mdfe_fiscal_documents_closure_xml_check" CHECK (("closure_xml_object_id" is null) = ("closure_xml_sha256" is null) and ("closure_xml_sha256" is null or "closure_xml_sha256" ~ '^[0-9a-f]{64}$')),
	CONSTRAINT "mdfe_fiscal_documents_closed_state_check" CHECK ("status" <> 'closed' or ("closure_protocol" is not null and "closure_city_code" is not null and "closure_state" is not null and "closed_at" is not null)),
	CONSTRAINT "mdfe_fiscal_documents_cancellation_justification_check" CHECK ("cancellation_justification" is null or length("cancellation_justification") >= 15),
	CONSTRAINT "mdfe_fiscal_documents_cancellation_xml_check" CHECK (("cancellation_xml_object_id" is null) = ("cancellation_xml_sha256" is null) and ("cancellation_xml_sha256" is null or "cancellation_xml_sha256" ~ '^[0-9a-f]{64}$')),
	CONSTRAINT "mdfe_fiscal_documents_cancelled_state_check" CHECK ("status" <> 'cancelled' or ("cancellation_protocol" is not null and "cancellation_justification" is not null and "cancelled_at" is not null)),
	CONSTRAINT "mdfe_fiscal_documents_closed_never_cancels" CHECK ("closed_at" is null or "status" <> 'cancelled')
);
--> statement-breakpoint
CREATE TABLE "mdfe_issuance_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"manifest_id" uuid NOT NULL,
	"attempt_kind" text NOT NULL,
	"attempt_number" bigint NOT NULL,
	"status" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"idempotency_fingerprint" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"fiscal_environment" text NOT NULL,
	"fiscal_series" text DEFAULT '' NOT NULL,
	"fiscal_number" bigint,
	"reservation_id" uuid,
	"last_error_code" text,
	"last_error_cause" text,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mdfe_issuance_attempts_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "mdfe_issuance_attempts_company_idempotency_key_unique" UNIQUE("company_id","idempotency_key"),
	CONSTRAINT "mdfe_issuance_attempts_company_manifest_kind_fingerprint_unique" UNIQUE("company_id","manifest_id","attempt_kind","request_fingerprint"),
	CONSTRAINT "mdfe_issuance_attempts_kind_check" CHECK ("attempt_kind" in ('issue', 'close', 'cancel')),
	CONSTRAINT "mdfe_issuance_attempts_status_check" CHECK ("status" in ('pending', 'in_flight', 'authorized', 'rejected', 'retry_scheduled', 'failed', 'reconciliation_required', 'closed', 'cancelled')),
	CONSTRAINT "mdfe_issuance_attempts_environment_check" CHECK ("fiscal_environment" in ('homologation', 'production')),
	CONSTRAINT "mdfe_issuance_attempts_attempt_number_check" CHECK ("attempt_number" > 0),
	CONSTRAINT "mdfe_issuance_attempts_idempotency_key_check" CHECK (length("idempotency_key") > 0),
	CONSTRAINT "mdfe_issuance_attempts_request_fingerprint_check" CHECK (length("request_fingerprint") > 0),
	CONSTRAINT "mdfe_issuance_attempts_reservation_check" CHECK ("attempt_kind" <> 'issue' or ("reservation_id" is not null and "fiscal_number" is not null and length("fiscal_series") > 0))
);
--> statement-breakpoint
CREATE TABLE "mdfe_issuance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"manifest_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mdfe_issuance_events_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "mdfe_issuance_events_name_check" CHECK ("event_name" in ('issue_requested', 'close_requested', 'cancel_requested', 'in_flight', 'authorized', 'rejected', 'failed', 'retry_scheduled', 'reconciliation_required', 'closed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "mdfe_issuance_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"event_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_subtype" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"manifest_id" uuid NOT NULL,
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
	CONSTRAINT "mdfe_issuance_outbox_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "mdfe_issuance_outbox_company_id_event_id_unique" UNIQUE("company_id","event_id"),
	CONSTRAINT "mdfe_issuance_outbox_attempt_kind_check" CHECK ("attempt_kind" in ('issue', 'close', 'cancel')),
	CONSTRAINT "mdfe_issuance_outbox_status_check" CHECK ("status" in ('requested', 'retry_scheduled')),
	CONSTRAINT "mdfe_issuance_outbox_event_type_check" CHECK ("event_type" in ('transportada.mdfe.manifest.issue.requested', 'transportada.mdfe.manifest.close.requested', 'transportada.mdfe.manifest.cancel.requested')),
	CONSTRAINT "mdfe_issuance_outbox_event_version_check" CHECK ("event_version" > 0),
	CONSTRAINT "mdfe_issuance_outbox_claim_check" CHECK (("claim_owner" is null) = ("claim_expires_at" is null))
);
--> statement-breakpoint
CREATE TABLE "mdfe_manifest_drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"manifest_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"driver_name" text NOT NULL,
	"driver_tax_id" text NOT NULL,
	"position" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mdfe_manifest_drivers_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "mdfe_manifest_drivers_company_manifest_driver_unique" UNIQUE("company_id","manifest_id","driver_id"),
	CONSTRAINT "mdfe_manifest_drivers_company_manifest_position_unique" UNIQUE("company_id","manifest_id","position"),
	CONSTRAINT "mdfe_manifest_drivers_position_check" CHECK ("position" between 1 and 10),
	CONSTRAINT "mdfe_manifest_drivers_tax_id_check" CHECK ("driver_tax_id" ~ '^[0-9]{11}$'),
	CONSTRAINT "mdfe_manifest_drivers_name_check" CHECK (length("driver_name") > 0)
);
--> statement-breakpoint
CREATE TABLE "mdfe_manifest_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"manifest_id" uuid NOT NULL,
	"cte_fiscal_document_id" uuid NOT NULL,
	"access_key" text NOT NULL,
	"discharge_city_code" text NOT NULL,
	"discharge_city_name" text NOT NULL,
	"cargo_value" numeric(15,2) DEFAULT '0' NOT NULL,
	"cargo_weight" numeric(15,4) DEFAULT '0' NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mdfe_manifest_items_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "mdfe_manifest_items_company_manifest_document_unique" UNIQUE("company_id","manifest_id","cte_fiscal_document_id"),
	CONSTRAINT "mdfe_manifest_items_access_key_check" CHECK ("access_key" ~ '^[0-9]{44}$'),
	CONSTRAINT "mdfe_manifest_items_discharge_city_code_check" CHECK ("discharge_city_code" ~ '^[0-9]{7}$'),
	CONSTRAINT "mdfe_manifest_items_discharge_city_name_check" CHECK (length("discharge_city_name") > 0 and length("discharge_city_name") <= 60),
	CONSTRAINT "mdfe_manifest_items_totals_check" CHECK ("cargo_value" >= 0 and "cargo_weight" >= 0)
);
--> statement-breakpoint
CREATE TABLE "mdfe_manifest_loading_cities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"manifest_id" uuid NOT NULL,
	"city_code" text NOT NULL,
	"city_name" text NOT NULL,
	"position" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mdfe_manifest_loading_cities_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "mdfe_manifest_loading_cities_company_manifest_city_unique" UNIQUE("company_id","manifest_id","city_code"),
	CONSTRAINT "mdfe_manifest_loading_cities_company_manifest_position_unique" UNIQUE("company_id","manifest_id","position"),
	CONSTRAINT "mdfe_manifest_loading_cities_city_code_check" CHECK ("city_code" ~ '^[0-9]{7}$'),
	CONSTRAINT "mdfe_manifest_loading_cities_city_name_check" CHECK (length("city_name") > 0 and length("city_name") <= 60),
	CONSTRAINT "mdfe_manifest_loading_cities_position_check" CHECK ("position" between 1 and 50)
);
--> statement-breakpoint
CREATE TABLE "mdfe_manifests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"fiscal_environment" text NOT NULL,
	"emitter_type" text DEFAULT '1' NOT NULL,
	"transporter_type" text DEFAULT '' NOT NULL,
	"origin_state" text NOT NULL,
	"destination_state" text NOT NULL,
	"cargo_type" text DEFAULT '' NOT NULL,
	"cargo_product" text DEFAULT '' NOT NULL,
	"cargo_product_ncm" text DEFAULT '' NOT NULL,
	"cargo_unit" text DEFAULT '01' NOT NULL,
	"cte_count" bigint DEFAULT 0 NOT NULL,
	"cargo_value" numeric(15,2) DEFAULT '0' NOT NULL,
	"cargo_weight" numeric(15,4) DEFAULT '0' NOT NULL,
	"rntrc" text DEFAULT '' NOT NULL,
	"fiscal_series" text DEFAULT '' NOT NULL,
	"fiscal_number" bigint,
	"trip_started_at" timestamp with time zone,
	"additional_information" text DEFAULT '' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mdfe_manifests_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "mdfe_manifests_status_check" CHECK ("status" in ('draft', 'issuing', 'authorized', 'rejected', 'closed', 'cancelled')),
	CONSTRAINT "mdfe_manifests_environment_check" CHECK ("fiscal_environment" in ('homologation', 'production')),
	CONSTRAINT "mdfe_manifests_emitter_type_check" CHECK ("emitter_type" in ('1', '2', '3')),
	CONSTRAINT "mdfe_manifests_transporter_type_check" CHECK (length("transporter_type") = 0 or "transporter_type" in ('1', '2', '3')),
	CONSTRAINT "mdfe_manifests_state_check" CHECK ("origin_state" ~ '^[A-Z]{2}$' and "destination_state" ~ '^[A-Z]{2}$'),
	CONSTRAINT "mdfe_manifests_cargo_type_check" CHECK (length("cargo_type") = 0 or "cargo_type" in ('01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12')),
	CONSTRAINT "mdfe_manifests_cargo_unit_check" CHECK ("cargo_unit" in ('01', '02')),
	CONSTRAINT "mdfe_manifests_cargo_product_ncm_check" CHECK (length("cargo_product_ncm") = 0 or "cargo_product_ncm" ~ '^[0-9]{8}$'),
	CONSTRAINT "mdfe_manifests_rntrc_check" CHECK (length("rntrc") = 0 or "rntrc" ~ '^[0-9]{8}$'),
	CONSTRAINT "mdfe_manifests_totals_check" CHECK ("cte_count" >= 0 and "cargo_value" >= 0 and "cargo_weight" >= 0),
	CONSTRAINT "mdfe_manifests_fiscal_number_check" CHECK ("fiscal_number" is null or "fiscal_number" > 0),
	CONSTRAINT "mdfe_manifests_issued_state_check" CHECK ("status" not in ('authorized', 'closed', 'cancelled') or ("fiscal_number" is not null and length("fiscal_series") > 0)),
	CONSTRAINT "mdfe_manifests_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE INDEX "mdfe_issuance_attempts_company_status_created_at_idx" ON "mdfe_issuance_attempts" ("company_id","status","created_at");--> statement-breakpoint
CREATE INDEX "mdfe_issuance_events_company_manifest_created_at_idx" ON "mdfe_issuance_events" ("company_id","manifest_id","created_at");--> statement-breakpoint
CREATE INDEX "mdfe_issuance_outbox_company_published_next_attempt_created_idx" ON "mdfe_issuance_outbox" ("company_id","published_at","next_attempt_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mdfe_manifest_items_live_document_unique" ON "mdfe_manifest_items" ("company_id","cte_fiscal_document_id") WHERE "released_at" is null;--> statement-breakpoint
CREATE INDEX "mdfe_manifest_items_company_manifest_city_idx" ON "mdfe_manifest_items" ("company_id","manifest_id","discharge_city_code");--> statement-breakpoint
CREATE UNIQUE INDEX "mdfe_manifests_company_environment_series_number_unique" ON "mdfe_manifests" ("company_id","fiscal_environment","fiscal_series","fiscal_number") WHERE "fiscal_number" is not null;--> statement-breakpoint
CREATE INDEX "mdfe_manifests_company_status_created_at_idx" ON "mdfe_manifests" ("company_id","status","created_at");--> statement-breakpoint
ALTER TABLE "mdfe_fiscal_documents" ADD CONSTRAINT "mdfe_fiscal_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_fiscal_documents" ADD CONSTRAINT "mdfe_fiscal_documents_company_manifest_fk" FOREIGN KEY ("company_id","manifest_id") REFERENCES "mdfe_manifests"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_fiscal_documents" ADD CONSTRAINT "mdfe_fiscal_documents_company_attempt_fk" FOREIGN KEY ("company_id","attempt_id") REFERENCES "mdfe_issuance_attempts"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_fiscal_documents" ADD CONSTRAINT "mdfe_fiscal_documents_company_xml_object_fk" FOREIGN KEY ("company_id","xml_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_fiscal_documents" ADD CONSTRAINT "mdfe_fiscal_documents_company_closure_xml_object_fk" FOREIGN KEY ("company_id","closure_xml_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_fiscal_documents" ADD CONSTRAINT "mdfe_fiscal_documents_company_cancellation_xml_object_fk" FOREIGN KEY ("company_id","cancellation_xml_object_id") REFERENCES "stored_objects"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_issuance_attempts" ADD CONSTRAINT "mdfe_issuance_attempts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_issuance_attempts" ADD CONSTRAINT "mdfe_issuance_attempts_company_manifest_fk" FOREIGN KEY ("company_id","manifest_id") REFERENCES "mdfe_manifests"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_issuance_attempts" ADD CONSTRAINT "mdfe_issuance_attempts_company_reservation_fk" FOREIGN KEY ("company_id","reservation_id") REFERENCES "fiscal_sequence_reservations"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_issuance_events" ADD CONSTRAINT "mdfe_issuance_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_issuance_events" ADD CONSTRAINT "mdfe_issuance_events_company_attempt_fk" FOREIGN KEY ("company_id","attempt_id") REFERENCES "mdfe_issuance_attempts"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_issuance_events" ADD CONSTRAINT "mdfe_issuance_events_company_manifest_fk" FOREIGN KEY ("company_id","manifest_id") REFERENCES "mdfe_manifests"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_issuance_outbox" ADD CONSTRAINT "mdfe_issuance_outbox_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_issuance_outbox" ADD CONSTRAINT "mdfe_issuance_outbox_company_aggregate_fk" FOREIGN KEY ("company_id","aggregate_id") REFERENCES "mdfe_manifests"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_issuance_outbox" ADD CONSTRAINT "mdfe_issuance_outbox_company_manifest_fk" FOREIGN KEY ("company_id","manifest_id") REFERENCES "mdfe_manifests"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_issuance_outbox" ADD CONSTRAINT "mdfe_issuance_outbox_company_attempt_fk" FOREIGN KEY ("company_id","attempt_id") REFERENCES "mdfe_issuance_attempts"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_issuance_outbox" ADD CONSTRAINT "mdfe_issuance_outbox_actor_membership_fk" FOREIGN KEY ("actor_user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_manifest_drivers" ADD CONSTRAINT "mdfe_manifest_drivers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_manifest_drivers" ADD CONSTRAINT "mdfe_manifest_drivers_company_manifest_fk" FOREIGN KEY ("company_id","manifest_id") REFERENCES "mdfe_manifests"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_manifest_drivers" ADD CONSTRAINT "mdfe_manifest_drivers_company_driver_fk" FOREIGN KEY ("company_id","driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_manifest_items" ADD CONSTRAINT "mdfe_manifest_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_manifest_items" ADD CONSTRAINT "mdfe_manifest_items_company_manifest_fk" FOREIGN KEY ("company_id","manifest_id") REFERENCES "mdfe_manifests"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_manifest_items" ADD CONSTRAINT "mdfe_manifest_items_company_document_fk" FOREIGN KEY ("company_id","cte_fiscal_document_id") REFERENCES "cte_fiscal_documents"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_manifest_loading_cities" ADD CONSTRAINT "mdfe_manifest_loading_cities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_manifest_loading_cities" ADD CONSTRAINT "mdfe_manifest_loading_cities_company_manifest_fk" FOREIGN KEY ("company_id","manifest_id") REFERENCES "mdfe_manifests"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_manifests" ADD CONSTRAINT "mdfe_manifests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "mdfe_manifests" ADD CONSTRAINT "mdfe_manifests_company_vehicle_fk" FOREIGN KEY ("company_id","vehicle_id") REFERENCES "fleet_vehicles"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;