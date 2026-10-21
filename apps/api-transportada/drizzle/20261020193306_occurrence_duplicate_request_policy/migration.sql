ALTER TABLE "company_occurrence_types" ADD COLUMN "duplicate_request_policy" varchar(24) DEFAULT 'allow' NOT NULL;--> statement-breakpoint
-- Spec 276 T4: o tipo que já pede algo à contratante passa a bloquear o pedido repetido; os outros ficam como hoje.
UPDATE "company_occurrence_types" SET "duplicate_request_policy" = 'while_request_open' WHERE "contractor_reply_mode" <> 'off';--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_duplicate_request_policy_check" CHECK ("duplicate_request_policy" in ('while_request_open', 'until_resolved', 'allow'));
