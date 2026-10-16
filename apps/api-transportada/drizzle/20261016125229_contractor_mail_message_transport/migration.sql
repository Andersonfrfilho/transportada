-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 268: por onde o worker envia a mensagem de e-mail da contratante. `resend` é o que sempre foi;
-- `sandbox_smtp` só nasce fora de produção, com CONTRACTOR_MAIL_SANDBOX_SMTP ligado. Aditiva: toda linha
-- antiga fica `resend`.
ALTER TABLE "contractor_mail_messages" ADD COLUMN "transport" varchar(16) DEFAULT 'resend' NOT NULL;--> statement-breakpoint
ALTER TABLE "contractor_mail_messages" ADD CONSTRAINT "contractor_mail_messages_transport_check" CHECK ("transport" in ('resend', 'sandbox_smtp'));
