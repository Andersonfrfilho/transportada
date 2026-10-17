-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 270 (ADR-0107): o tipo de ocorrencia tem escopo de contratantes. `contractor_scope` ('all' | 'listed',
-- padrao 'all': todo tipo existente fica geral) e a lista em `company_occurrence_type_contractors`
-- (FK do tipo CASCADE, da contratante RESTRICT). Aditiva: nenhuma linha antiga muda, sem backfill.
CREATE TABLE "company_occurrence_type_contractors" (
	"company_id" uuid,
	"occurrence_type_id" uuid,
	"contractor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_occurrence_type_contractors_pk" PRIMARY KEY("company_id","occurrence_type_id","contractor_id")
);
--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "contractor_scope" varchar(16) DEFAULT 'all' NOT NULL;--> statement-breakpoint
CREATE INDEX "company_occurrence_type_contractors_contractor_idx" ON "company_occurrence_type_contractors" ("company_id","contractor_id");--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractors" ADD CONSTRAINT "company_occurrence_type_contractors_type_fk" FOREIGN KEY ("company_id","occurrence_type_id") REFERENCES "company_occurrence_types"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_occurrence_type_contractors" ADD CONSTRAINT "company_occurrence_type_contractors_contractor_fk" FOREIGN KEY ("company_id","contractor_id") REFERENCES "contractors"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_contractor_scope_check" CHECK ("contractor_scope" in ('all', 'listed'));