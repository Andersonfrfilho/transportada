-- Spec 281 T6 (RF4): o webhook do Evolution por empresa. Aditiva: webhook_id opaco (alvo da URL publica), o segredo do cabecalho selado e os horarios de registro e da ultima entrega.
ALTER TABLE "whatsapp_evolution_settings" ADD COLUMN "webhook_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_evolution_settings" ADD COLUMN "webhook_secret_envelope" jsonb;--> statement-breakpoint
ALTER TABLE "whatsapp_evolution_settings" ADD COLUMN "webhook_registered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whatsapp_evolution_settings" ADD COLUMN "last_webhook_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whatsapp_evolution_settings" ADD CONSTRAINT "whatsapp_evolution_settings_webhook_id_unique" UNIQUE("webhook_id");