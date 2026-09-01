CREATE TABLE "whatsapp_webhook_nonces" (
	"key" text PRIMARY KEY,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "whatsapp_webhook_nonces_key_check" CHECK (length("key") between 1 and 512)
);
