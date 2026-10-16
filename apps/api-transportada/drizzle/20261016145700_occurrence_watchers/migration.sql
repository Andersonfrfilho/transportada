-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 267: responsáveis por ocorrências (cópia no e-mail da contratante). Aditiva: duas tabelas novas e a coluna
-- `cc_addresses` com padrão vazio em `contractor_mail_messages`; nenhuma linha existente muda.
CREATE TABLE "company_occurrence_watchers" (
	"company_id" uuid,
	"user_id" uuid,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_occurrence_watchers_pk" PRIMARY KEY("company_id","user_id"),
	CONSTRAINT "company_occurrence_watchers_status_check" CHECK ("status" in ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "contractor_occurrence_watchers" (
	"company_id" uuid,
	"contractor_id" uuid,
	"user_id" uuid,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractor_occurrence_watchers_pk" PRIMARY KEY("company_id","contractor_id","user_id"),
	CONSTRAINT "contractor_occurrence_watchers_status_check" CHECK ("status" in ('active', 'inactive'))
);
--> statement-breakpoint
ALTER TABLE "contractor_mail_messages" ADD COLUMN "cc_addresses" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_watchers" ADD CONSTRAINT "company_occurrence_watchers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_occurrence_watchers" ADD CONSTRAINT "company_occurrence_watchers_membership_fk" FOREIGN KEY ("user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_occurrence_watchers" ADD CONSTRAINT "contractor_occurrence_watchers_contractor_fk" FOREIGN KEY ("company_id","contractor_id") REFERENCES "contractors"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "contractor_occurrence_watchers" ADD CONSTRAINT "contractor_occurrence_watchers_membership_fk" FOREIGN KEY ("user_id","company_id") REFERENCES "user_company_memberships"("user_id","company_id") ON DELETE CASCADE ON UPDATE CASCADE;