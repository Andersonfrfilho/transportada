-- Spec 238 T1.2 (ADR-0096 §Modelo de dados): o calendário de dias úteis ganha dado. O feriado "todo ano"
-- (o aniversário da cidade incluído) vira REGRA em tabela própria; `municipal_holidays` segue guardando só
-- datas fixas, e o roteirizador, que casa `holiday_on = data`, não muda.
--
-- Aditiva: três tabelas novas (`municipal_holiday_rules`, `state_holidays`,
-- `company_business_calendar_settings`) e, em `municipal_holidays` (tabela JÁ PUBLICADA), exatamente
-- isto — nada mais, e tudo no FIM do arquivo:
--   1. `ADD COLUMN "kind" text DEFAULT 'holiday' NOT NULL`   (linhas antigas viram `holiday`)
--   2. `ADD COLUMN "source_rule_id" uuid`                       (nulo = digitada à mão)
--   3. `ADD CONSTRAINT "municipal_holidays_kind_check"`        (NOT VALID + VALIDATE)
--   4. `ADD CONSTRAINT "municipal_holidays_company_source_rule_fk"`  (FK composta, ON DELETE CASCADE)
--   5. `CREATE INDEX "municipal_holidays_company_source_rule_idx"`    (parcial, só `source_rule_id` não nulo)
-- Nenhum INSERT, UPDATE ou backfill. O unique `(company_id, city_ibge_code, holiday_on)`, `holiday_on`, o
-- CHECK de cidade e o nome da tabela ficam como estão.
--
-- Custo de lock a enxergar em produção (medir `count(*)` de `municipal_holidays` e a duração do lote antes):
--   * ⚠️ O `ADD COLUMN` toma ACCESS EXCLUSIVE em `municipal_holidays`, e o Postgres só o solta no COMMIT.
--     O migrador aplica TODAS as migrations pendentes numa transação só: o lock fica retido
--     até o COMMIT do lote inteiro, não até o fim deste arquivo. Por isso os comandos desta tabela vão
--     para o fim (o que vem antes não a toca), mas o que o lote ainda tiver DEPOIS deste arquivo roda com o
--     lock retido. Em produção: aplicar num deploy sem migration longa enfileirada atrás desta.
--   * O default constante é guardado no catálogo (Postgres >= 11): o `ADD COLUMN` não reescreve a tabela.
--     `source_rule_id` anulável, sem default, é só catálogo.
--   * O par `NOT VALID` + `VALIDATE` não encurta o lock retido: o `VALIDATE` toma SHARE UPDATE EXCLUSIVE,
--     mas roda na mesma transação, com o ACCESS EXCLUSIVE do `ADD COLUMN` ainda valendo.
--   * A FK composta toma SHARE ROW EXCLUSIVE em `municipal_holidays` e em `municipal_holiday_rules` e valida
--     as linhas existentes; como `source_rule_id` é nulo em todas e a FK é MATCH SIMPLE, não há o que conferir.
--   * `CREATE INDEX` comum toma SHARE em `municipal_holidays` enquanto constrói; o índice é parcial e nasce
--     vazio, mas a varredura é da tabela inteira. `CONCURRENTLY` não cabe numa transação. A tabela é pequena
--     (feriado digitado à mão), mas confira.
--   * Cada tabela nova nasce vazia; as FKs para `companies` tomam SHARE ROW EXCLUSIVE nela por um instante.
--   `lock_timeout` só limita a ESPERA para adquirir cada lock (aborta a migration se não vier em 3 s, em vez
--   de enfileirar o tráfego atrás de uma transação longa); não limita quanto tempo o lock fica retido.
--
-- ⚠️ CHECK e NULL: `month between 1 and 12` com `month` nulo dá NULL, e CHECK aceita NULL. Em
-- `state_holidays` a ponta `yearly` exige `month`/`day` `is not null` à parte, de propósito.
SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE TABLE "company_business_calendar_settings" (
	"company_id" uuid PRIMARY KEY,
	"saturday_is_business_day" boolean DEFAULT false NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "municipal_holiday_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"city_ibge_code" text NOT NULL,
	"month" integer NOT NULL,
	"day" integer NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"materialized_through_year" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "municipal_holiday_rules_company_id_id_unique" UNIQUE("company_id","id"),
	CONSTRAINT "municipal_holiday_rules_company_city_day_unique" UNIQUE("company_id","city_ibge_code","month","day"),
	CONSTRAINT "municipal_holiday_rules_city_check" CHECK ("city_ibge_code" ~ '^[1-5][0-9]{6}$'),
	CONSTRAINT "municipal_holiday_rules_state_check" CHECK (substr("city_ibge_code", 1, 2) in ('11', '12', '13', '14', '15', '16', '17', '21', '22', '23', '24', '25', '26', '27', '28', '29', '31', '32', '33', '35', '41', '42', '43', '50', '51', '52', '53')),
	CONSTRAINT "municipal_holiday_rules_month_day_check" CHECK ("month" between 1 and 12 and "day" between 1 and (case when "month" = 2 then 29 when "month" in (4, 6, 9, 11) then 30 else 31 end)),
	CONSTRAINT "municipal_holiday_rules_kind_check" CHECK ("kind" in ('holiday', 'city_anniversary')),
	CONSTRAINT "municipal_holiday_rules_name_check" CHECK (char_length("name") between 1 and 120),
	CONSTRAINT "municipal_holiday_rules_materialized_through_year_check" CHECK ("materialized_through_year" between 1583 and 9999)
);
--> statement-breakpoint
CREATE TABLE "state_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"state_ibge_code" text NOT NULL,
	"recurrence" text NOT NULL,
	"holiday_on" date,
	"month" integer,
	"day" integer,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "state_holidays_state_check" CHECK ("state_ibge_code" in ('11', '12', '13', '14', '15', '16', '17', '21', '22', '23', '24', '25', '26', '27', '28', '29', '31', '32', '33', '35', '41', '42', '43', '50', '51', '52', '53')),
	CONSTRAINT "state_holidays_recurrence_check" CHECK ("recurrence" in ('once', 'yearly')),
	CONSTRAINT "state_holidays_name_check" CHECK (char_length("name") between 1 and 120),
	CONSTRAINT "state_holidays_shape_check" CHECK (("recurrence" = 'once' and "holiday_on" is not null and "month" is null and "day" is null) or ("recurrence" = 'yearly' and "holiday_on" is null and "month" is not null and "day" is not null and "month" between 1 and 12 and "day" between 1 and (case when "month" = 2 then 29 when "month" in (4, 6, 9, 11) then 30 else 31 end)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "state_holidays_company_state_once_unique" ON "state_holidays" ("company_id","state_ibge_code","holiday_on") WHERE "recurrence" = 'once';--> statement-breakpoint
CREATE UNIQUE INDEX "state_holidays_company_state_yearly_unique" ON "state_holidays" ("company_id","state_ibge_code","month","day") WHERE "recurrence" = 'yearly';--> statement-breakpoint
ALTER TABLE "company_business_calendar_settings" ADD CONSTRAINT "company_business_calendar_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "municipal_holiday_rules" ADD CONSTRAINT "municipal_holiday_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "state_holidays" ADD CONSTRAINT "state_holidays_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "municipal_holidays" ADD COLUMN "kind" text DEFAULT 'holiday' NOT NULL;--> statement-breakpoint
ALTER TABLE "municipal_holidays" ADD COLUMN "source_rule_id" uuid;--> statement-breakpoint
ALTER TABLE "municipal_holidays" ADD CONSTRAINT "municipal_holidays_kind_check" CHECK ("kind" in ('holiday', 'city_anniversary')) NOT VALID;--> statement-breakpoint
ALTER TABLE "municipal_holidays" VALIDATE CONSTRAINT "municipal_holidays_kind_check";--> statement-breakpoint
ALTER TABLE "municipal_holidays" ADD CONSTRAINT "municipal_holidays_company_source_rule_fk" FOREIGN KEY ("company_id","source_rule_id") REFERENCES "municipal_holiday_rules"("company_id","id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
CREATE INDEX "municipal_holidays_company_source_rule_idx" ON "municipal_holidays" ("company_id","source_rule_id") WHERE "source_rule_id" is not null;--> statement-breakpoint
-- A pasta roda na mesma transação das migrations seguintes: devolve o prazo ao padrão da sessão.
SET LOCAL lock_timeout = DEFAULT;
