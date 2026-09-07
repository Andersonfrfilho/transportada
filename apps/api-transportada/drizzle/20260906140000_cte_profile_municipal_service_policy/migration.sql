-- O portão de serviço municipal vira configuração do perfil de emissão de CT-e.
--
-- `allow` é o padrão e é o comportamento de hoje: quem separa CT-e de NFS-e continua sendo o
-- operador, pelos dois botões da tela. Nenhuma instalação muda de comportamento com esta migration.
alter table "cte_emission_profiles"
  add column "municipal_service_policy" text not null default 'allow';

alter table "cte_emission_profiles"
  add constraint "cte_emission_profiles_municipal_service_policy_check"
  check ("municipal_service_policy" in ('allow', 'block'));
