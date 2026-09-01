CREATE TABLE "login_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "login_identifiers_user_kind_value_unique" UNIQUE("user_id","kind","value"),
	CONSTRAINT "login_identifiers_kind_check" CHECK ("kind" in ('email', 'document', 'phone')),
	CONSTRAINT "login_identifiers_value_not_blank_check" CHECK (length(btrim("value")) > 0),
	CONSTRAINT "login_identifiers_value_normalized_check" CHECK ("value" = lower(btrim("value")))
);
--> statement-breakpoint
CREATE INDEX "login_identifiers_kind_value_idx" ON "login_identifiers" ("kind","value");--> statement-breakpoint
ALTER TABLE "login_identifiers" ADD CONSTRAINT "login_identifiers_user_id_identity_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
-- Semeia o que já existe, para o dia um funcionar sem ninguém recadastrar nada. O convite grava o
-- endereço em `contact_address` e a coluna `email` fica vazia na maioria das contas: os dois entram.
INSERT INTO "login_identifiers" ("user_id", "kind", "value")
SELECT "user_id", 'email', lower(btrim("email"))
FROM "identity_user_profiles"
WHERE btrim("email") <> '' AND "email" LIKE '%@%'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "login_identifiers" ("user_id", "kind", "value")
SELECT "user_id", 'email', lower(btrim("contact_address"))
FROM "identity_user_profiles"
WHERE "contact_channel" = 'email' AND btrim("contact_address") <> '' AND "contact_address" LIKE '%@%'
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Documento sem máscara e em caixa baixa: o CNPJ alfanumérico entra igual, e a normalização é a
-- mesma que a resolução aplica no que a pessoa digitar.
INSERT INTO "login_identifiers" ("user_id", "kind", "value")
SELECT "user_id", 'document', lower(regexp_replace("tax_id", '[^0-9A-Za-z]', '', 'g'))
FROM "identity_user_profiles"
WHERE length(regexp_replace("tax_id", '[^0-9A-Za-z]', '', 'g')) > 0
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Telefone só dígito, das duas origens: a coluna e o contato quando o canal não é e-mail.
INSERT INTO "login_identifiers" ("user_id", "kind", "value")
SELECT "user_id", 'phone', regexp_replace("phone", '[^0-9]', '', 'g')
FROM "identity_user_profiles"
WHERE length(regexp_replace("phone", '[^0-9]', '', 'g')) > 0
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "login_identifiers" ("user_id", "kind", "value")
SELECT "user_id", 'phone', regexp_replace("contact_address", '[^0-9]', '', 'g')
FROM "identity_user_profiles"
WHERE "contact_channel" <> 'email'
  AND length(regexp_replace("contact_address", '[^0-9]', '', 'g')) > 0
ON CONFLICT DO NOTHING;
