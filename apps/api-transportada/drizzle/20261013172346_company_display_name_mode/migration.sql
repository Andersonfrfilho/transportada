-- Qual nome a empresa mostra: `trade_name` (fantasia, caindo na razão social quando vazia) ou `legal_name`.
-- Vale para o que é exibição (painel, app do motorista, e-mails, PDFs comerciais); documento fiscal (CT-e, MDF-e,
-- NFS-e) segue sempre com a razão social. Escolha por empresa (CNPJ), em Configurações.
--
-- Aditiva: uma coluna `NOT NULL` com default constante (no Postgres 11+ não reescreve a tabela) e o CHECK dela. Toda
-- linha existente nasce `trade_name`, que é o que a maioria das telas já fazia. O ADD COLUMN toma ACCESS EXCLUSIVE em
-- `company_fiscal_profiles` até o COMMIT do lote; a tabela tem uma linha por CNPJ da instalação.
ALTER TABLE "company_fiscal_profiles" ADD COLUMN "display_name_mode" text DEFAULT 'trade_name' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_fiscal_profiles" ADD CONSTRAINT "company_fiscal_profiles_display_name_mode_check" CHECK ("display_name_mode" in ('trade_name', 'legal_name'));