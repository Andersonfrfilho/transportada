-- Copyright (c) 2026 Ada Technology. MIT License.
-- Spec 286 (RF4): marca o e-mail ao cliente que saiu como queda do WhatsApp automático (`fallback_from = 'whatsapp'`),
-- para o painel mostrar "reserva do WhatsApp". Aditiva: coluna nula e uma CHECK; nenhuma linha antiga muda.
ALTER TABLE "occurrence_contractor_reply_deliveries" ADD COLUMN "fallback_from" varchar(16);--> statement-breakpoint
ALTER TABLE "occurrence_contractor_reply_deliveries" ADD CONSTRAINT "occurrence_contractor_reply_deliveries_fallback_from_check" CHECK ("fallback_from" is null or ("fallback_from" in ('whatsapp') and "target" = 'client_boleto_emails'));