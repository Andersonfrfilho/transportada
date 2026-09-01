CREATE TABLE "contractors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"tax_id" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"closing_period" text DEFAULT 'monthly' NOT NULL,
	"report_email" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractors_company_tax_id_unique" UNIQUE("company_id","tax_id"),
	CONSTRAINT "contractors_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "contractors_status_check" CHECK ("status" in ('active', 'inactive')),
	CONSTRAINT "contractors_tax_id_check" CHECK ("tax_id" ~ '^[0-9]{11}$|^[A-Z0-9]{12}[0-9]{2}$'),
	CONSTRAINT "contractors_closing_period_check" CHECK ("closing_period" in ('fortnightly', 'monthly'))
);
--> statement-breakpoint
CREATE TABLE "delivery_client_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"delivery_client_id" uuid NOT NULL,
	"exception_on" date NOT NULL,
	"kind" text NOT NULL,
	"opens_at" time,
	"closes_at" time,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_client_exceptions_kind_check" CHECK ("kind" in ('closed', 'open')),
	CONSTRAINT "delivery_client_exceptions_hours_check" CHECK (("kind" = 'closed' and "opens_at" is null and "closes_at" is null) or ("kind" = 'open' and "opens_at" is not null and "closes_at" is not null and "opens_at" < "closes_at"))
);
--> statement-breakpoint
CREATE TABLE "delivery_client_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"delivery_client_id" uuid NOT NULL,
	"weekday" bigint NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_client_windows_weekday_check" CHECK ("weekday" between 0 and 6),
	CONSTRAINT "delivery_client_windows_interval_check" CHECK ("opens_at" < "closes_at")
);
--> statement-breakpoint
CREATE TABLE "delivery_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"tax_id" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"requires_scheduling" boolean DEFAULT false NOT NULL,
	"delivery_fee_amount" numeric(14,4),
	"default_service_time_minutes" bigint,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_clients_company_tax_id_unique" UNIQUE("company_id","tax_id"),
	CONSTRAINT "delivery_clients_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "delivery_clients_status_check" CHECK ("status" in ('active', 'inactive')),
	CONSTRAINT "delivery_clients_tax_id_check" CHECK ("tax_id" ~ '^[0-9]{11}$|^[A-Z0-9]{12}[0-9]{2}$'),
	CONSTRAINT "delivery_clients_fee_check" CHECK ("delivery_fee_amount" is null or "delivery_fee_amount" >= 0),
	CONSTRAINT "delivery_clients_service_time_check" CHECK ("default_service_time_minutes" is null or "default_service_time_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "municipal_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"city_ibge_code" text NOT NULL,
	"holiday_on" date NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "municipal_holidays_company_city_day_unique" UNIQUE("company_id","city_ibge_code","holiday_on"),
	CONSTRAINT "municipal_holidays_city_check" CHECK ("city_ibge_code" ~ '^[0-9]{7}$'),
	CONSTRAINT "municipal_holidays_name_check" CHECK (length("name") > 0)
);
--> statement-breakpoint
CREATE INDEX "delivery_client_exceptions_client_idx" ON "delivery_client_exceptions" ("company_id","delivery_client_id","exception_on");--> statement-breakpoint
CREATE INDEX "delivery_client_windows_client_idx" ON "delivery_client_windows" ("company_id","delivery_client_id");--> statement-breakpoint
ALTER TABLE "contractors" ADD CONSTRAINT "contractors_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "delivery_client_exceptions" ADD CONSTRAINT "delivery_client_exceptions_client_fk" FOREIGN KEY ("company_id","delivery_client_id") REFERENCES "delivery_clients"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "delivery_client_windows" ADD CONSTRAINT "delivery_client_windows_client_fk" FOREIGN KEY ("company_id","delivery_client_id") REFERENCES "delivery_clients"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "delivery_clients" ADD CONSTRAINT "delivery_clients_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "municipal_holidays" ADD CONSTRAINT "municipal_holidays_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;