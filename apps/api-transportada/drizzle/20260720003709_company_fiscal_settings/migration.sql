CREATE TABLE "company_fiscal_profiles" (
	"company_id" uuid PRIMARY KEY,
	"legal_name" text NOT NULL,
	"trade_name" text NOT NULL,
	"cnpj" text NOT NULL CONSTRAINT "company_fiscal_profiles_cnpj_unique" UNIQUE,
	"state_registration" text NOT NULL,
	"municipal_registration" text NOT NULL,
	"tax_regime" text NOT NULL,
	"rntrc" text NOT NULL,
	"street" text NOT NULL,
	"number" text NOT NULL,
	"complement" text NOT NULL,
	"district" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"postal_code" text NOT NULL,
	"city_ibge_code" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"environment" text DEFAULT 'homologation' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_fiscal_profiles_cnpj_check" CHECK ("cnpj" ~ '^[0-9]{14}$'),
	CONSTRAINT "company_fiscal_profiles_environment_check" CHECK ("environment" in ('homologation', 'production')),
	CONSTRAINT "company_fiscal_profiles_tax_regime_check" CHECK ("tax_regime" in ('1', '2', '3')),
	CONSTRAINT "company_fiscal_profiles_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE TABLE "digital_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"purpose" text DEFAULT 'cte' NOT NULL,
	"version" bigint NOT NULL,
	"status" text NOT NULL,
	"secret_envelope" jsonb,
	"validated_cnpj" text NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"fingerprint" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "digital_certificates_company_id_purpose_version_unique" UNIQUE("company_id","purpose","version"),
	CONSTRAINT "digital_certificates_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "digital_certificates_purpose_check" CHECK ("purpose" = 'cte'),
	CONSTRAINT "digital_certificates_status_check" CHECK ("status" in ('active', 'retired')),
	CONSTRAINT "digital_certificates_version_check" CHECK ("version" > 0),
	CONSTRAINT "digital_certificates_envelope_status_check" CHECK (("status" = 'active' and "secret_envelope" is not null) or ("status" = 'retired' and "secret_envelope" is null)),
	CONSTRAINT "digital_certificates_validated_cnpj_check" CHECK ("validated_cnpj" ~ '^[0-9]{14}$'),
	CONSTRAINT "digital_certificates_validity_range_check" CHECK ("valid_from" < "expires_at")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"correlation_id" text NOT NULL,
	"before_snapshot" jsonb,
	"after_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"company_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"status" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_records_company_id_operation_idempotency_key_unique" UNIQUE("company_id","operation","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "fiscal_sequence_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"fiscal_sequence_id" uuid NOT NULL,
	"reservation_key" text NOT NULL,
	"number" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_sequence_reservations_company_id_reservation_key_unique" UNIQUE("company_id","reservation_key"),
	CONSTRAINT "fiscal_sequence_reservations_sequence_id_number_unique" UNIQUE("fiscal_sequence_id","number"),
	CONSTRAINT "fiscal_sequence_reservations_number_check" CHECK ("number" > 0)
);
--> statement-breakpoint
CREATE TABLE "fiscal_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"model" text DEFAULT 'cte' NOT NULL,
	"series" bigint NOT NULL,
	"next_number" bigint NOT NULL,
	"last_reserved_number" bigint,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_sequences_company_id_environment_model_series_unique" UNIQUE("company_id","environment","model","series"),
	CONSTRAINT "fiscal_sequences_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "fiscal_sequences_environment_check" CHECK ("environment" in ('homologation', 'production')),
	CONSTRAINT "fiscal_sequences_model_check" CHECK ("model" = 'cte'),
	CONSTRAINT "fiscal_sequences_series_check" CHECK ("series" > 0),
	CONSTRAINT "fiscal_sequences_number_coherence_check" CHECK ("next_number" > 0 and ("last_reserved_number" is null or ("last_reserved_number" > 0 and "next_number" = "last_reserved_number" + 1))),
	CONSTRAINT "fiscal_sequences_version_check" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "digital_certificates_company_id_purpose_active_unique" ON "digital_certificates" ("company_id","purpose") WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX "digital_certificates_company_id_created_at_id_idx" ON "digital_certificates" ("company_id","created_at","id");--> statement-breakpoint
CREATE INDEX "audit_logs_company_id_created_at_id_idx" ON "audit_logs" ("company_id","created_at","id");--> statement-breakpoint
CREATE INDEX "idempotency_records_company_id_created_at_idx" ON "idempotency_records" ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "fiscal_sequence_reservations_company_id_sequence_id_idx" ON "fiscal_sequence_reservations" ("company_id","fiscal_sequence_id");--> statement-breakpoint
ALTER TABLE "company_fiscal_profiles" ADD CONSTRAINT "company_fiscal_profiles_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "digital_certificates" ADD CONSTRAINT "digital_certificates_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "digital_certificates" ADD CONSTRAINT "digital_certificates_created_by_user_id_identity_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_identity_users_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "fiscal_sequence_reservations" ADD CONSTRAINT "fiscal_sequence_reservations_company_sequence_fk" FOREIGN KEY ("company_id","fiscal_sequence_id") REFERENCES "fiscal_sequences"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "fiscal_sequences" ADD CONSTRAINT "fiscal_sequences_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
CREATE FUNCTION "reject_audit_logs_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "audit_logs_append_only_trigger"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION "reject_audit_logs_mutation"();--> statement-breakpoint
CREATE FUNCTION "reject_fiscal_sequence_reservations_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'fiscal_sequence_reservations is append-only' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "fiscal_sequence_reservations_append_only_trigger"
BEFORE UPDATE OR DELETE ON "fiscal_sequence_reservations"
FOR EACH ROW
EXECUTE FUNCTION "reject_fiscal_sequence_reservations_mutation"();
