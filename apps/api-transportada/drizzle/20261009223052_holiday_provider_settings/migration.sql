-- Copyright (c) 2026 Ada Technology. MIT License.
-- Spec 262 (ADR-0102 §3): a chave da FeriadosAPI e o orçamento mensal passam a morar no banco, uma linha por
-- fornecedor da INSTALAÇÃO (sem `company_id`: a conta do fornecedor e a cota são da instalação, ADR-0021,
-- como o cache da 252). `token_envelope` é o envelope A256GCM com AAD amarrado ao `id` da linha (o `keyId`
-- vai dentro dele; não há coluna à parte), `token_hint` são os 4 últimos caracteres em claro e só a tela os lê.
--
-- `monthly_request_budget` NULL = "o padrão" (4500, constante do código): só o que o administrador DEFINIU fica
-- gravado, então mudar o padrão no código vale para quem nunca o definiu, e o primeiro `PUT` com a chave não grava
-- orçamento. A CHECK diz o NULL por extenso e, fora dele, fecha o intervalo de 1 a 1.000.000. O worker resolve
-- `coalesce(monthly_request_budget, 4500)`.
--
-- Aditiva e mínima: uma tabela nova, vazia, sem linha semeada (sem linha = sem chave e orçamento padrão).
-- Nenhuma tabela publicada é tocada, nenhum lock além do `CREATE TABLE`. Todo nome de constraint é explícito e
-- cabe nos 63 bytes do Postgres (o maior tem 41). A CHECK da chave aceita NULL, por isso exige cada campo com
-- `is not null` à parte: os três da chave são nulos juntos, ou o envelope é um objeto, a dica tem exatamente
-- 4 caracteres ASCII visíveis e a data está preenchida.
--
-- Reverter: o `rollback.sql` apaga a tabela sem recusar (nenhum dado de negócio; a chave se reemite no
-- fornecedor) e só roda DEPOIS de reverter o worker da 262, que lê esta tabela a cada ciclo.
CREATE TABLE "holiday_provider_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"provider" text DEFAULT 'feriadosapi' NOT NULL CONSTRAINT "holiday_provider_settings_provider_unique" UNIQUE,
	"token_envelope" jsonb,
	"token_hint" text,
	"token_updated_at" timestamp with time zone,
	"monthly_request_budget" integer,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holiday_provider_settings_provider_check" CHECK ("provider" in ('feriadosapi')),
	CONSTRAINT "holiday_provider_settings_budget_check" CHECK ("monthly_request_budget" is null or "monthly_request_budget" between 1 and 1000000),
	CONSTRAINT "holiday_provider_settings_version_check" CHECK ("version" > 0),
	CONSTRAINT "holiday_provider_settings_token_check" CHECK (("token_envelope" is null and "token_hint" is null and "token_updated_at" is null) or ("token_envelope" is not null and jsonb_typeof("token_envelope") = 'object' and "token_hint" is not null and "token_hint" ~ '^[!-~]{4}$' and "token_updated_at" is not null))
);
