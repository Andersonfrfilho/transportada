-- Spec 250 T2.2 (ADR 0098): o perfil de emissão ganha o código de tributação nacional (cTribNac, seis
-- dígitos) e a alíquota efetiva do Simples Nacional, e a tentativa de emissão ganha a chave de
-- idempotência do provedor (`hash_pedido` da Nota RP v3).
--
-- Aditiva: três colunas NULÁVEIS sem DEFAULT e duas CHECK que aceitam NULL. Nenhuma linha existente é
-- reescrita (ADD COLUMN nulável é só catálogo); as CHECK validam as linhas já existentes, todas NULL,
-- numa varredura curta de tabelas pequenas. `simples_national_rate` é percentual (2.000000 = 2,00%).
ALTER TABLE "nfse_emission_profiles" ADD COLUMN "national_taxation_code" text;--> statement-breakpoint
ALTER TABLE "nfse_emission_profiles" ADD COLUMN "simples_national_rate" numeric(9,6);--> statement-breakpoint
ALTER TABLE "nfse_issuance_attempts" ADD COLUMN "provider_request_key" text;--> statement-breakpoint
ALTER TABLE "nfse_emission_profiles" ADD CONSTRAINT "nfse_emission_profiles_national_taxation_code_check" CHECK ("national_taxation_code" is null or "national_taxation_code" ~ '^[0-9]{6}$');--> statement-breakpoint
ALTER TABLE "nfse_emission_profiles" ADD CONSTRAINT "nfse_emission_profiles_simples_national_rate_check" CHECK ("simples_national_rate" is null or "simples_national_rate" >= 0);