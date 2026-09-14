ALTER TABLE "contractor_mail_messages" ADD COLUMN "subject" text NOT NULL;--> statement-breakpoint
ALTER TABLE "contractor_mail_messages" ADD COLUMN "to_addresses" text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "contractor_mail_messages" ADD CONSTRAINT "contractor_mail_messages_subject_check" CHECK (length(btrim("subject")) > 0);--> statement-breakpoint
ALTER TABLE "contractor_mail_messages" ADD CONSTRAINT "contractor_mail_messages_to_addresses_check" CHECK (array_length("to_addresses", 1) > 0);