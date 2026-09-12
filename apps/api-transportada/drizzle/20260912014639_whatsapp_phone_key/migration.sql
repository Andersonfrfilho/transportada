DROP INDEX "user_whatsapp_phones_phone_verified_unique";--> statement-breakpoint
ALTER TABLE "user_whatsapp_phones" ADD COLUMN "phone_key" text GENERATED ALWAYS AS (left("phone", 4) || right("phone", 8)) STORED;--> statement-breakpoint
CREATE UNIQUE INDEX "user_whatsapp_phones_phone_key_verified_unique" ON "user_whatsapp_phones" ("phone_key") WHERE "verified_at" is not null;