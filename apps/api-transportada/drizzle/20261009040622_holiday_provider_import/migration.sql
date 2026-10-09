-- Spec 252 T2.2 (ADR-0100 §3): os feriados passam a poder vir da FeriadosAPI. A migration cria o cache
-- GLOBAL do que o fornecedor respondeu (sem `company_id`, como `geocoded_addresses`), a demanda, o cursor e
-- as supressões POR EMPRESA, marca a origem em `municipal_holidays` e `state_holidays` e põe a rotina
-- `holiday.provider.pull` no relógio — PAUSADA DE FÁBRICA (D13), porque sem token cada janela diária
-- fecharia `unexpected_error`. Despausar é passo do usuário, junto com o token.
--
-- Aditiva: seis tabelas novas e, nas duas tabelas JÁ PUBLICADAS do calendário, exatamente isto — nada
-- mais, e tudo no FIM do arquivo (`state_holidays` primeiro, `municipal_holidays`, que o roteirizador lê,
-- por último):
--   1. `ADD COLUMN "provider_entry_id" uuid`                       (nulo = digitada ou gerada por regra)
--   2. `ADD CONSTRAINT "..._provider_entry_fk"`                    (FK COMPOSTA para o cache: id, ibge e data; `RESTRICT`)
--   3. `ADD CONSTRAINT "municipal_holidays_rule_or_provider_check"` / `"state_holidays_provider_once_check"`
--      (`NOT VALID` + `VALIDATE`)
--   4. `CREATE INDEX "..._provider_entry_idx"`                     (parcial, só `provider_entry_id` não nulo)
-- Os dois CHECK de `job` mudam de lista, não de nome, e a única linha escrita é a do relógio da rotina.
-- Todo nome de constraint e de índice é explícito (o padrão do drizzle para a FK de `municipal_holidays`
-- teria 67 bytes, acima dos 63 do Postgres, que trunca calado e faz o `snapshot.json` divergir do banco).
--
-- Custo de lock a enxergar em produção (medir `count(*)` de `municipal_holidays` e `state_holidays` e a duração do
-- lote antes; se forem grandes, o `VALIDATE` vai para migration própria e o índice parcial para `CONCURRENTLY`):
--   * ⚠️ O `ADD COLUMN` toma ACCESS EXCLUSIVE em cada tabela publicada, e o Postgres só o solta no COMMIT.
--     O migrador aplica TODAS as migrations pendentes numa transação só: o lock fica retido
--     até o COMMIT do lote inteiro, não até o fim deste arquivo. Por isso os comandos dessas tabelas vão
--     para o fim, e a tabela que o roteirizador lê é a última a ser trancada. Em produção: aplicar num
--     deploy sem migration longa enfileirada atrás desta.
--   * `provider_entry_id` anulável, sem default, é só catálogo: o `ADD COLUMN` não reescreve a tabela.
--   * ⚠️ Mas são três varreduras completas de cada tabela publicada, todas com o ACCESS EXCLUSIVE do
--     `ADD COLUMN` ainda valendo: a validação da FK, o `VALIDATE` da CHECK e a construção do índice. O par
--     `NOT VALID` + `VALIDATE` não encurta o lock retido, porque o `VALIDATE` roda na mesma transação; a coluna
--     nasce nula, então nenhuma varredura acha o que reprovar, mas todas leem a tabela.
--   * `CREATE INDEX` comum toma SHARE enquanto constrói; `CONCURRENTLY` não cabe numa transação.
--   * ⚠️ `job_executions` e `job_schedules` ficam trancadas durante todo o trecho do calendário: o
--     `DROP`/`ADD CONSTRAINT` toma ACCESS EXCLUSIVE e o Postgres o solta só no COMMIT do lote, não ao fim do comando.
--     São minúsculas e as duas CHECK entram `NOT VALID` e são validadas à parte, mas a batida do cron e a tela de
--     rotinas esperam o lote inteiro.
--   * Cada tabela nova nasce vazia; as FKs para `companies` tomam SHARE ROW EXCLUSIVE nela por um instante.
--   `lock_timeout` só limita a ESPERA para adquirir cada lock (aborta a migration se não vier em 3 s, em
--   vez de enfileirar o tráfego atrás de uma transação longa); não limita quanto tempo o lock fica retido.
--
-- ⚠️ Reverter só com o worker também revertido, e só com o catálogo de jobs de antes no ar — senão a batida
-- publica um job que a CHECK recusa. O rollback recusa se houver feriado importado, supressão do
-- operador, empresa que desligou a importação ou execução aberta da rotina (dado que a versão antiga não
-- guarda). Ele descarta o cache do fornecedor, e refazê-lo custa cota (Q3). O rollback da `business_calendar`
-- (238) recusa enquanto esta migration existir: desfazer esta antes.
--
-- ⚠️ Esta migration só pode ir ao ar junto com o catálogo de jobs que conhece `holiday.provider.pull`
-- (API, worker, cron e painel): a CHECK de `job` do schema TS e a do banco precisam ser a mesma lista.
SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE TABLE "holiday_provider_fetches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"scope" text NOT NULL,
	"ibge_code" text NOT NULL,
	"year" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"next_attempt_at" timestamp with time zone,
	"fetched_at" timestamp with time zone,
	CONSTRAINT "holiday_provider_fetches_scope_code_year_unique" UNIQUE("scope","ibge_code","year"),
	CONSTRAINT "holiday_provider_fetches_scope_check" CHECK ("scope" in ('city', 'state', 'national')),
	CONSTRAINT "holiday_provider_fetches_scope_code_check" CHECK (("scope" = 'city' and "ibge_code" ~ '^[1-5][0-9]{6}$') or ("scope" = 'state' and "ibge_code" in ('11', '12', '13', '14', '15', '16', '17', '21', '22', '23', '24', '25', '26', '27', '28', '29', '31', '32', '33', '35', '41', '42', '43', '50', '51', '52', '53')) or ("scope" = 'national' and "ibge_code" = 'BR')),
	CONSTRAINT "holiday_provider_fetches_status_check" CHECK ("status" in ('pending', 'done', 'failed', 'quota_exhausted', 'not_covered')),
	CONSTRAINT "holiday_provider_fetches_year_check" CHECK ("year" between 1583 and 9999),
	CONSTRAINT "holiday_provider_fetches_attempts_check" CHECK ("attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "holiday_provider_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"scope" text NOT NULL,
	"ibge_code" text NOT NULL,
	"holiday_on" date NOT NULL,
	"name" text NOT NULL,
	"provider_type" text NOT NULL,
	"external_id" text,
	"is_banking" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "holiday_provider_entries_scope_code_day_unique" UNIQUE("scope","ibge_code","holiday_on"),
	CONSTRAINT "holiday_provider_entries_id_code_day_unique" UNIQUE("id","ibge_code","holiday_on"),
	CONSTRAINT "holiday_provider_entries_scope_check" CHECK ("scope" in ('city', 'state', 'national')),
	CONSTRAINT "holiday_provider_entries_scope_code_check" CHECK (("scope" = 'city' and "ibge_code" ~ '^[1-5][0-9]{6}$') or ("scope" = 'state' and "ibge_code" in ('11', '12', '13', '14', '15', '16', '17', '21', '22', '23', '24', '25', '26', '27', '28', '29', '31', '32', '33', '35', '41', '42', '43', '50', '51', '52', '53')) or ("scope" = 'national' and "ibge_code" = 'BR')),
	CONSTRAINT "holiday_provider_entries_provider_type_check" CHECK ("provider_type" in ('NACIONAL', 'ESTADUAL', 'MUNICIPAL', 'FACULTATIVO')),
	CONSTRAINT "holiday_provider_entries_scope_type_check" CHECK (("scope" = 'city' and "provider_type" in ('MUNICIPAL', 'FACULTATIVO')) or ("scope" = 'state' and "provider_type" in ('ESTADUAL', 'FACULTATIVO')) or ("scope" = 'national' and "provider_type" in ('NACIONAL', 'FACULTATIVO'))),
	CONSTRAINT "holiday_provider_entries_name_check" CHECK (char_length("name") between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "holiday_provider_monthly_usage" (
	"month" date PRIMARY KEY,
	"requests" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "holiday_provider_monthly_usage_month_check" CHECK (extract(day from "month") = 1),
	CONSTRAINT "holiday_provider_monthly_usage_requests_check" CHECK ("requests" >= 0)
);
--> statement-breakpoint
CREATE TABLE "holiday_import_cities" (
	"company_id" uuid,
	"city_ibge_code" text,
	"document_count" integer DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holiday_import_cities_pkey" PRIMARY KEY("company_id","city_ibge_code"),
	CONSTRAINT "holiday_import_cities_city_check" CHECK ("city_ibge_code" ~ '^[1-5][0-9]{6}$'),
	CONSTRAINT "holiday_import_cities_document_count_check" CHECK ("document_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "company_holiday_import_settings" (
	"company_id" uuid PRIMARY KEY,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"cursor_updated_at" timestamp with time zone,
	"cursor_issued_at" timestamp with time zone,
	"cursor_document_id" uuid,
	CONSTRAINT "company_holiday_import_settings_cursor_check" CHECK (("cursor_updated_at" is null and "cursor_issued_at" is null and "cursor_document_id" is null) or ("cursor_updated_at" is not null and "cursor_issued_at" is not null and "cursor_document_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "holiday_import_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"company_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"ibge_code" text NOT NULL,
	"holiday_on" date NOT NULL,
	"suppressed_by_user_id" uuid NOT NULL,
	"suppressed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holiday_import_suppressions_company_scope_code_day_unique" UNIQUE("company_id","scope","ibge_code","holiday_on"),
	CONSTRAINT "holiday_import_suppressions_scope_check" CHECK ("scope" in ('city', 'state')),
	CONSTRAINT "holiday_import_suppressions_scope_code_check" CHECK (("scope" = 'city' and "ibge_code" ~ '^[1-5][0-9]{6}$') or ("scope" = 'state' and "ibge_code" in ('11', '12', '13', '14', '15', '16', '17', '21', '22', '23', '24', '25', '26', '27', '28', '29', '31', '32', '33', '35', '41', '42', '43', '50', '51', '52', '53')))
);
--> statement-breakpoint
CREATE INDEX "holiday_provider_fetches_status_next_attempt_idx" ON "holiday_provider_fetches" ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "holiday_import_cities_city_idx" ON "holiday_import_cities" ("city_ibge_code");--> statement-breakpoint
ALTER TABLE "company_holiday_import_settings" ADD CONSTRAINT "company_holiday_import_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "holiday_import_cities" ADD CONSTRAINT "holiday_import_cities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "holiday_import_suppressions" ADD CONSTRAINT "holiday_import_suppressions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check";--> statement-breakpoint
ALTER TABLE "job_executions" ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read', 'cargo-preview.retention.apply', 'nfe.recipient-email.backfill', 'holiday.provider.pull')) NOT VALID;--> statement-breakpoint
ALTER TABLE "job_executions" VALIDATE CONSTRAINT "job_executions_job_check";--> statement-breakpoint
ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check";--> statement-breakpoint
ALTER TABLE "job_schedules" ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read', 'cargo-preview.retention.apply', 'nfe.recipient-email.backfill', 'holiday.provider.pull')) NOT VALID;--> statement-breakpoint
ALTER TABLE "job_schedules" VALIDATE CONSTRAINT "job_schedules_job_check";--> statement-breakpoint
INSERT INTO "job_schedules" ("job", "interval_seconds", "next_run_at", "enabled", "paused_at", "paused_origin") VALUES
	('holiday.provider.pull', 86400, now(), false, now(), 'system');--> statement-breakpoint
ALTER TABLE "state_holidays" ADD COLUMN "provider_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "state_holidays" ADD CONSTRAINT "state_holidays_provider_entry_fk" FOREIGN KEY ("provider_entry_id","state_ibge_code","holiday_on") REFERENCES "holiday_provider_entries"("id","ibge_code","holiday_on") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "state_holidays" ADD CONSTRAINT "state_holidays_provider_once_check" CHECK ("provider_entry_id" is null or "recurrence" = 'once') NOT VALID;--> statement-breakpoint
ALTER TABLE "state_holidays" VALIDATE CONSTRAINT "state_holidays_provider_once_check";--> statement-breakpoint
CREATE INDEX "state_holidays_provider_entry_idx" ON "state_holidays" ("company_id","provider_entry_id") WHERE "provider_entry_id" is not null;--> statement-breakpoint
ALTER TABLE "municipal_holidays" ADD COLUMN "provider_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "municipal_holidays" ADD CONSTRAINT "municipal_holidays_provider_entry_fk" FOREIGN KEY ("provider_entry_id","city_ibge_code","holiday_on") REFERENCES "holiday_provider_entries"("id","ibge_code","holiday_on") ON DELETE RESTRICT ON UPDATE RESTRICT;--> statement-breakpoint
ALTER TABLE "municipal_holidays" ADD CONSTRAINT "municipal_holidays_rule_or_provider_check" CHECK (not ("source_rule_id" is not null and "provider_entry_id" is not null)) NOT VALID;--> statement-breakpoint
ALTER TABLE "municipal_holidays" VALIDATE CONSTRAINT "municipal_holidays_rule_or_provider_check";--> statement-breakpoint
CREATE INDEX "municipal_holidays_provider_entry_idx" ON "municipal_holidays" ("company_id","provider_entry_id") WHERE "provider_entry_id" is not null;--> statement-breakpoint
-- A pasta roda na mesma transação das migrations seguintes: devolve o prazo ao padrão da sessão.
SET LOCAL lock_timeout = DEFAULT;
