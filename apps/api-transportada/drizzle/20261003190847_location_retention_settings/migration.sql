-- Spec 239 D1: a empresa decide se a posição dos eventos da viagem é apagada, e depois de quantos
-- dias (30 a 90, padrão 90). Sem linha = desligado, 90 dias: o deploy desta migration não muda o
-- comportamento de ninguém, porque nenhuma empresa tem linha no dia em que ela entra.
--
-- Aditiva: uma tabela nova e cinco índices parciais `(company_id, <tempo>) WHERE latitude is not
-- null`, um por tabela de evento, para a junção por empresa do worker (D2) e a contagem de impacto
-- da tela (D5). Os cinco índices só por tempo (`<tabela>_located_<tempo>_idx`) continuam: a rotina
-- de hoje ainda varre só por data, e o novo, com `company_id` na frente, não serve a ela.
--
-- Custo de lock a enxergar em produção:
--   * `CREATE INDEX` comum toma SHARE na tabela: leitura segue, **INSERT/UPDATE/DELETE esperam**. O
--     índice é parcial, mas a construção ainda varre a tabela inteira para achar as linhas com ponto.
--   * O migrador aplica a pasta numa transação só, então `CONCURRENTLY` não é possível, e o SHARE de
--     cada uma das cinco tabelas fica preso até o COMMIT — toda escrita de evento do motorista
--     (chegada, entrega, comprovante, status, ocorrência) espera a migration inteira terminar.
--   * A FK nova toma SHARE ROW EXCLUSIVE em `companies` (escrita em empresa espera); a tabela nasce
--     vazia, então a validação é instantânea.
--   Aplique FORA do horário de campo, e meça o tamanho das cinco tabelas em staging antes.
--   `lock_timeout` aborta a migration inteira se algum lock não vier em 3 s, em vez de enfileirar o
--   tráfego do motorista atrás de uma transação longa que já segura a tabela.
SET LOCAL lock_timeout = '3s';--> statement-breakpoint
CREATE TABLE "company_location_retention_settings" (
	"company_id" uuid PRIMARY KEY,
	"purge_enabled" boolean DEFAULT false NOT NULL,
	"retention_days" integer DEFAULT 90 NOT NULL,
	"purge_effective_at" timestamp with time zone,
	"updated_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_location_retention_settings_retention_days_check" CHECK ("retention_days" between 30 and 90),
	CONSTRAINT "company_location_retention_settings_effective_at_check" CHECK (not "purge_enabled" or "purge_effective_at" is not null)
);
--> statement-breakpoint
CREATE INDEX "trip_delivery_proofs_company_located_created_at_idx" ON "trip_delivery_proofs" ("company_id","created_at") WHERE "latitude" is not null;--> statement-breakpoint
CREATE INDEX "trip_document_occurrences_company_located_created_at_idx" ON "trip_document_occurrences" ("company_id","created_at") WHERE "latitude" is not null;--> statement-breakpoint
CREATE INDEX "trip_status_events_company_located_recorded_at_idx" ON "trip_status_events" ("company_id","recorded_at") WHERE "latitude" is not null;--> statement-breakpoint
CREATE INDEX "trip_stop_events_company_located_created_at_idx" ON "trip_stop_events" ("company_id","created_at") WHERE "latitude" is not null;--> statement-breakpoint
CREATE INDEX "trip_stop_occurrences_company_located_created_at_idx" ON "trip_stop_occurrences" ("company_id","created_at") WHERE "latitude" is not null;--> statement-breakpoint
ALTER TABLE "company_location_retention_settings" ADD CONSTRAINT "company_location_retention_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
-- A pasta roda na mesma transação das migrations seguintes: devolve o prazo ao padrão da sessão.
SET LOCAL lock_timeout = DEFAULT;
