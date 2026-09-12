-- O perfil de emissão diz qual documento fiscal a nota gera (spec 144 D3).
--
-- `cte` é o padrão e é o comportamento de hoje, e o ponteiro para o perfil de NFS-e nasce nulo:
-- nenhuma linha existente muda com esta migration, e as três restrições valem para todas elas.
ALTER TABLE "cte_emission_profiles" ADD COLUMN "output_document" text DEFAULT 'cte' NOT NULL;--> statement-breakpoint
ALTER TABLE "cte_emission_profiles" ADD COLUMN "nfse_emission_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "cte_emission_profiles" ADD CONSTRAINT "cte_emission_profiles_company_nfse_profile_fk" FOREIGN KEY ("company_id","nfse_emission_profile_id") REFERENCES "nfse_emission_profiles"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "cte_emission_profiles" ADD CONSTRAINT "cte_emission_profiles_output_document_check" CHECK ("output_document" in ('cte', 'nfse'));--> statement-breakpoint
ALTER TABLE "cte_emission_profiles" ADD CONSTRAINT "cte_emission_profiles_nfse_profile_check" CHECK (("output_document" = 'nfse') = ("nfse_emission_profile_id" is not null));--> statement-breakpoint
ALTER TABLE "cte_emission_profiles" ADD CONSTRAINT "cte_emission_profiles_output_municipal_check" CHECK ("output_document" = 'cte' or "municipal_service_policy" = 'allow');
