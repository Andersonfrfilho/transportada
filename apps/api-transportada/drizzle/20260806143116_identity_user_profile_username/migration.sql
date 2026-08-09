-- Coluna aditiva em tabela populada: entra anulável, recebe o login que o Keycloak já tem
-- (o convite cria o usuário com `username` igual ao `user_id`) e só então vira NOT NULL.
ALTER TABLE "identity_user_profiles" ADD COLUMN "username" text;--> statement-breakpoint
UPDATE "identity_user_profiles" SET "username" = "user_id"::text WHERE "username" IS NULL;--> statement-breakpoint
ALTER TABLE "identity_user_profiles" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_user_profiles" ADD CONSTRAINT "identity_user_profiles_username_key" UNIQUE("username");
