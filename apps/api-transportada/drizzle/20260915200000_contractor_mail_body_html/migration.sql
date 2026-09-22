ALTER TABLE "contractor_mail_messages" ADD COLUMN "body_html" text;--> statement-breakpoint
ALTER TABLE "contractor_mail_messages" ADD CONSTRAINT "contractor_mail_messages_body_html_direction_check" CHECK ("body_html" is null or "direction" = 'outbound');--> statement-breakpoint
ALTER TABLE "contractor_mail_messages" ADD CONSTRAINT "contractor_mail_messages_body_html_size_check" CHECK (octet_length("body_html") <= 524288);
