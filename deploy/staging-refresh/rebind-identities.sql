-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Religa os usuários do realm de staging às pessoas do sistema, depois do restore de produção.
--
-- Entrada: um TSV `subject, username, email, is_service` por usuário do realm, lido de `pstdin`, e a
-- variável `:issuer` (o issuer do Keycloak de staging). `is_service` marca quem tem o papel de realm
-- `transportada-service`. Do diretório corrente (o de trabalho do script) vêm os dois TSV do Keycloak
-- de produção: `production-users.tsv` (`id, username, email, realm_id`) e `production-realms.tsv`
-- (`id, name`). Saída: uma linha só, com as contagens — `realm_users skipped
-- linked_by_production linked_by_username linked_by_email linked_service ambiguous unmatched`.
--
-- Regras do casamento:
--   1. identidade de produção primeiro: o username de staging é o de um usuário do Keycloak de
--      produção cujo subject já está em `external_identities`, com o issuer daquele realm. É a única
--      regra que não depende do perfil da cópia ter o mesmo username ou e-mail (14/09/2026: 0 de 3);
--   2. username do perfil: é único no realm e em `identity_user_profiles`, e é o que a pessoa digita;
--   3. e-mail só para quem nenhuma das anteriores casou — o e-mail do perfil **não** é único;
--   4. a conta de serviço (papel `transportada-service`) casa com a pessoa do sistema que tem
--      membership ativa com papel `automation` (ADR-0047): ela não tem perfil nem e-mail;
--   5. casamento que cai em mais de uma pessoa é ambíguo e fica de fora: vínculo errado entrega a
--      conta de alguém a outro, e ficar sem vínculo só a deixa sem entrar;
--   6. `service-account-*` sem o papel do serviço fica de fora, como na sincronização da API.
--
-- Tudo numa transação: ou o realm inteiro é religado, ou nada é.
begin;

create temporary table realm_users (
  subject text not null,
  username text not null,
  email text not null,
  is_service boolean not null
) on commit drop;

\copy realm_users from pstdin

create temporary table production_realms (
  id text not null,
  name text not null
) on commit drop;

\copy production_realms from 'production-realms.tsv'

create temporary table production_users (
  subject text not null,
  username text not null,
  email text not null,
  realm_id text not null
) on commit drop;

\copy production_users from 'production-users.tsv'

-- A conta de serviço pode vir da listagem e do papel ao mesmo tempo: fica a linha que diz serviço.
create temporary table realm_accounts on commit drop as
select distinct on (subject)
  subject,
  lower(btrim(username)) as username,
  lower(btrim(email)) as email,
  is_service
from realm_users
where subject <> ''
order by subject, is_service desc;

create temporary table candidate_links on commit drop as
with people as (
  select * from realm_accounts
  where not is_service and username not like 'service-account-%'
),
-- O realm de produção é o do issuer: `<base>/realms/<nome>`. O `master` nunca casa, porque nenhum
-- issuer da API termina nele; o issuer de staging fica de fora mesmo que o nome do realm seja o mesmo.
by_production as (
  select r.subject, e.user_id, 'production' as matched_by
  from people r
  join production_users pu on lower(btrim(pu.username)) = r.username
  join production_realms pr on pr.id = pu.realm_id
  join external_identities e on e.subject = pu.subject
    and e.issuer <> :'issuer'
    and substring(e.issuer from '/realms/([^/]+)/?$') = pr.name
  where r.username <> ''
),
by_username as (
  select r.subject, p.user_id, 'username' as matched_by
  from people r
  join identity_user_profiles p on lower(btrim(p.username)) = r.username
  where r.username <> ''
    and not exists (select 1 from by_production x where x.subject = r.subject)
),
by_email as (
  select r.subject, p.user_id, 'email' as matched_by
  from people r
  join identity_user_profiles p on lower(btrim(p.email)) = r.email
  where r.email <> ''
    and not exists (select 1 from by_production x where x.subject = r.subject)
    and not exists (select 1 from by_username u where u.subject = r.subject)
),
automation_users as (
  select distinct m.user_id
  from user_company_memberships m
  join membership_roles mr on mr.membership_id = m.id
  where mr.role = 'automation' and m.status = 'active'
),
by_service as (
  select r.subject, a.user_id, 'service' as matched_by
  from realm_accounts r
  cross join automation_users a
  where r.is_service
),
candidates as (
  select * from by_production
  union all
  select * from by_username
  union all
  select * from by_email
  union all
  select * from by_service
)
select
  subject,
  matched_by,
  count(distinct user_id) as users,
  min(user_id::text)::uuid as user_id
from candidates
group by subject, matched_by;

insert into external_identities (user_id, issuer, subject)
select user_id, :'issuer', subject
from candidate_links
where users = 1
on conflict (issuer, subject) do update
  set user_id = excluded.user_id, updated_at = now();

select
  total.realm_users,
  total.skipped,
  links.by_production,
  links.by_username,
  links.by_email,
  links.by_service,
  links.ambiguous,
  total.realm_users - total.skipped - links.by_production
    - links.by_username - links.by_email - links.by_service - links.ambiguous
from (
  select
    count(*) as realm_users,
    count(*) filter (where not is_service and username like 'service-account-%') as skipped
  from realm_accounts
) as total
cross join (
  select
    count(*) filter (where users = 1 and matched_by = 'production') as by_production,
    count(*) filter (where users = 1 and matched_by = 'username') as by_username,
    count(*) filter (where users = 1 and matched_by = 'email') as by_email,
    count(*) filter (where users = 1 and matched_by = 'service') as by_service,
    count(*) filter (where users > 1) as ambiguous
  from candidate_links
) as links;

commit;
