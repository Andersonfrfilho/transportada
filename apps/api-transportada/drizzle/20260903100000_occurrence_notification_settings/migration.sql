CREATE TABLE "company_occurrence_notification_settings" (
	"company_id" uuid NOT NULL,
	"type" text NOT NULL,
	"notifies" boolean NOT NULL DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_occurrence_notification_settings_pkey" PRIMARY KEY ("company_id", "type")
);

ALTER TABLE "company_occurrence_notification_settings"
	ADD CONSTRAINT "company_occurrence_notification_settings_company_id_companies_id_fk"
	FOREIGN KEY ("company_id") REFERENCES "companies"("id")
	ON DELETE restrict ON UPDATE cascade;

ALTER TABLE "company_occurrence_notification_settings"
	ADD CONSTRAINT "company_occurrence_notification_settings_type_check"
	CHECK ("type" IN ('item_faltante', 'item_avariado', 'divergencia_quantidade', 'recusa_total', 'recusa_parcial', 'avaria_transporte', 'destinatario_ausente'));

COMMENT ON TABLE "company_occurrence_notification_settings" IS
	'Quais tipos de ocorrencia a empresa escolheu ser avisada (spec 079). AUSENCIA DE LINHA E NAO AVISAR: o padrao e o silencio, e ligar e decisao da empresa tipo a tipo. Aviso que ninguem pediu vira ruido, e ruido faz o operador ignorar tambem o que importa.';

COMMENT ON COLUMN "company_occurrence_notification_settings"."notifies" IS
	'Linha com false e escolha registrada de NAO avisar - diferente de ausencia, que e o padrao nunca tocado. Guardar as duas permite a tela mostrar o que foi decidido.';
