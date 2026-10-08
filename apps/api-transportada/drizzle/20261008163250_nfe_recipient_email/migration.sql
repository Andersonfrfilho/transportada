-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- A nota guarda o e-mail do destinatário (`<dest><email>`), gravado pelo worker na importação.
-- Aditiva, sem UPDATE em dado: coluna nula e sem padrão — nota antiga fica nula até o backfill.
-- A CHECK vem depois da coluna: até 254 caracteres e forma de e-mail, o mesmo padrão da frota.
ALTER TABLE "nfe_documents" ADD COLUMN "recipient_email" text;--> statement-breakpoint
ALTER TABLE "nfe_documents" ADD CONSTRAINT "nfe_documents_recipient_email_check" CHECK ("recipient_email" is null or (length("recipient_email") <= 254 and "recipient_email" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));