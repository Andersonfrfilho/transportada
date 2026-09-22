ALTER TABLE "contractor_contacts" ADD CONSTRAINT "contractor_contacts_email_length_check" CHECK (length("email") <= 254) NOT VALID;
--> statement-breakpoint
ALTER TABLE "contractor_contacts" VALIDATE CONSTRAINT "contractor_contacts_email_length_check";