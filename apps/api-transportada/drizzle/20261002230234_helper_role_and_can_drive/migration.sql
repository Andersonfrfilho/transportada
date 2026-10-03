-- Spec 235: o ajudante é um perfil. Papel `helper` no catálogo de Acesso e `fleet_drivers.can_drive`.
--
-- Aditiva e reversível:
--   * `can_drive` nasce `true` em toda ficha existente — ninguém que dirige hoje deixa de dirigir.
--   * O CHECK da D2 (`can_drive or can_act_as_helper`) entra `NOT VALID` e é validado em statement à
--     parte: `VALIDATE CONSTRAINT` toma só SHARE UPDATE EXCLUSIVE, e a validação é trivialmente
--     verdadeira porque toda linha antiga tem `can_drive = true`.
--   * Os três CHECKs de papel (`membership_roles`, `user_invitation_roles`, `company_group_roles`)
--     só alargam: acrescentam `helper` e mantêm todos os nomes anteriores. São tabelas pequenas, como
--     na `20260824184702_separator_role`.
ALTER TABLE "fleet_drivers" ADD COLUMN "can_drive" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_crew_capability_check" CHECK ("can_drive" or "can_act_as_helper") NOT VALID;--> statement-breakpoint
ALTER TABLE "fleet_drivers" VALIDATE CONSTRAINT "fleet_drivers_crew_capability_check";--> statement-breakpoint
ALTER TABLE "company_group_roles" DROP CONSTRAINT "company_group_roles_role_check", ADD CONSTRAINT "company_group_roles_role_check" CHECK ("role" in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer', 'driver', 'aggregate', 'separator', 'helper', 'contractor', 'automation'));--> statement-breakpoint
ALTER TABLE "membership_roles" DROP CONSTRAINT "membership_roles_role_check", ADD CONSTRAINT "membership_roles_role_check" CHECK ("role" in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer', 'driver', 'aggregate', 'separator', 'helper', 'contractor', 'automation'));--> statement-breakpoint
ALTER TABLE "user_invitation_roles" DROP CONSTRAINT "user_invitation_roles_role_check", ADD CONSTRAINT "user_invitation_roles_role_check" CHECK ("role" in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer', 'driver', 'aggregate', 'separator', 'helper', 'contractor'));
