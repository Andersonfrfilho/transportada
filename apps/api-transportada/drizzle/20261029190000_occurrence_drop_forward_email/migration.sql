ALTER TABLE "company_occurrence_types" DROP CONSTRAINT "company_occurrence_types_forward_needs_text_check";--> statement-breakpoint
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT "company_occurrence_types_forward_email_subject_check";--> statement-breakpoint
ALTER TABLE "company_occurrence_types" DROP CONSTRAINT "company_occurrence_types_forward_email_body_check";--> statement-breakpoint
ALTER TABLE "company_occurrence_types" DROP COLUMN "forward_email_subject";--> statement-breakpoint
ALTER TABLE "company_occurrence_types" DROP COLUMN "forward_email_body";
