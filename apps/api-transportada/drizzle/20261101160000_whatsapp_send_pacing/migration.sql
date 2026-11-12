-- Spec 289: o espaçamento entre envios do WhatsApp (Evolution). `next_send_at` guarda a próxima vaga do número; o teto diário
-- padrão passa de 50 a 300 e quem ainda está no padrão antigo (50) acompanha. Aditiva: nenhuma linha some.
ALTER TABLE "whatsapp_evolution_settings" ADD COLUMN "next_send_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whatsapp_evolution_settings" ALTER COLUMN "daily_cap" SET DEFAULT 300;--> statement-breakpoint
UPDATE "whatsapp_evolution_settings" SET "daily_cap" = 300 WHERE "daily_cap" = 50;
