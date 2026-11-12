-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 286 T2 (RF2, RF5): a matriz "Retorno ao cliente" do tipo de ocorrencia, um canal por linha (caixa de marcar),
-- com o modo de envio e a chave do modelo do modulo de notificacao. Aditiva: `client_channel`, `client_email_type`,
-- `client_email_send_mode` e o texto livre `forward_email_subject`/`forward_email_body` ficam no tipo (a etapa B os
-- tira, com aprovacao). Preenchimento: as caixas pela mesma regra de `deriveClientChannelMatrixFromLegacy`; o texto
-- livre de cada tipo vira um modelo `email` do modulo (e um `whatsapp` sem HTML, quando o tipo fala por WhatsApp), com
-- a chave `occurrence.client-reply.<id do tipo>`, e o canal aponta para ele.
CREATE TABLE "company_occurrence_type_client_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"occurrence_type_id" uuid NOT NULL,
	"channel" varchar(16) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"send_mode" varchar(16) DEFAULT 'manual' NOT NULL,
	"template_key" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_occurrence_type_client_channels_unique" UNIQUE("company_id","occurrence_type_id","channel"),
	CONSTRAINT "company_occurrence_type_client_channels_channel_check" CHECK ("channel" in ('email', 'whatsapp')),
	CONSTRAINT "company_occurrence_type_client_channels_send_mode_check" CHECK ("send_mode" in ('manual', 'automatic')),
	CONSTRAINT "company_occurrence_type_client_channels_template_key_check" CHECK ("template_key" is null or length(btrim("template_key")) > 0)
);
--> statement-breakpoint
ALTER TABLE "company_occurrence_type_client_channels" ADD CONSTRAINT "company_occurrence_type_client_channels_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "company_occurrence_type_client_channels" ADD CONSTRAINT "company_occurrence_type_client_channels_type_fk" FOREIGN KEY ("company_id","occurrence_type_id") REFERENCES "company_occurrence_types"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
INSERT INTO "company_occurrence_type_client_channels" ("company_id", "occurrence_type_id", "channel", "enabled", "send_mode")
SELECT "company_id", "id", 'email', "client_channel" IN ('email', 'both') AND "client_email_type" <> 'off', "client_email_send_mode"
  FROM "company_occurrence_types"
UNION ALL
SELECT "company_id", "id", 'whatsapp', "client_channel" IN ('whatsapp', 'both'), 'manual'
  FROM "company_occurrence_types";--> statement-breakpoint
-- O schema `notification` e do modulo e migra depois deste (`runDatabaseMigrations`): numa base nova ele ainda nao
-- existe, e tambem nao ha tipo com texto para migrar. Modelo ja existente com a mesma identidade fica como esta.
DO $$
BEGIN
  IF to_regclass('notification.templates') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO "notification"."templates" ("company_id", "key", "channel", "locale", "version", "subject", "body", "active")
  SELECT "company_id", 'occurrence.client-reply.' || "id"::text, 'email', 'pt-BR', 1,
         left(btrim(regexp_replace("forward_email_subject", '\s+', ' ', 'g')), 256), btrim("forward_email_body"), true
    FROM "company_occurrence_types"
   WHERE btrim("forward_email_subject") <> '' AND btrim("forward_email_body") <> ''
  ON CONFLICT DO NOTHING;

  INSERT INTO "notification"."templates" ("company_id", "key", "channel", "locale", "version", "subject", "body", "active")
  SELECT "company_id", 'occurrence.client-reply.' || "id"::text, 'whatsapp', 'pt-BR', 1, NULL,
         btrim(regexp_replace("forward_email_body", '<[^>]*>', '', 'g')), true
    FROM "company_occurrence_types"
   WHERE "client_channel" IN ('whatsapp', 'both')
     AND btrim("forward_email_subject") <> ''
     AND btrim(regexp_replace("forward_email_body", '<[^>]*>', '', 'g')) <> ''
  ON CONFLICT DO NOTHING;

  UPDATE "company_occurrence_type_client_channels" AS c
     SET "template_key" = 'occurrence.client-reply.' || c."occurrence_type_id"::text
   WHERE EXISTS (
     SELECT 1 FROM "notification"."templates" AS n
      WHERE n."company_id" = c."company_id"
        AND n."key" = 'occurrence.client-reply.' || c."occurrence_type_id"::text
        AND n."channel" = c."channel"
        AND n."locale" = 'pt-BR'
        AND n."active"
   );
END
$$;
