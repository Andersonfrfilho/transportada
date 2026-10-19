-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 272 (D10): cargo livre do usuário na membership. Aditiva: nula, sem backfill; o CHECK aceita nulo e só
-- valida o tamanho de quem tem cargo (1..80 caracteres, a mesma regra da política do domínio).
ALTER TABLE "user_company_memberships" ADD COLUMN "job_title" varchar(80);--> statement-breakpoint
ALTER TABLE "user_company_memberships" ADD CONSTRAINT "user_company_memberships_job_title_check" CHECK ("job_title" is null or char_length("job_title") between 1 and 80);