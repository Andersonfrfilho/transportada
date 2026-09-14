-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Religa os usuários do realm de staging às pessoas do sistema, depois do restore de produção.
--
-- Entrada: um TSV `subject, username, email` por usuário do realm, lido de `pstdin`, e a variável
-- `:issuer` (o issuer do Keycloak de staging). Saída: uma linha só, com as contagens —
-- `realm_users service_accounts linked_by_username linked_by_email ambiguous unmatched`.
--
-- Regras do casamento:
--   1. username primeiro: é único no realm e em `identity_user_profiles`, e é o que a pessoa digita;
--   2. e-mail só para quem o username não casou — o e-mail do perfil **não** é único;
--   3. casamento que cai em mais de um usuário do sistema é ambíguo e fica de fora: vínculo errado
--      entrega a conta de uma pessoa a outra, e ficar sem vínculo só a deixa sem entrar;
--   4. `service-account-*` fica de fora, como na sincronização da API: conta de serviço não é gente
--      e não tem perfil.
--
-- Tudo numa transação: ou o realm inteiro é religado, ou nada é.
begin;

create temporary table realm_users (
  subject text not null,
  username text not null,
  email text not null
) on commit drop;

\copy realm_users from pstdin

create temporary table candidate_links on commit drop as
with realm as (
  select subject, lower(btrim(username)) as username, lower(btrim(email)) as email
  from realm_users
  where subject <> '' and username not like 'service-account-%'
),
by_username as (
  select r.subject, p.user_id, 'username' as matched_by
  from realm r
  join identity_user_profiles p on lower(btrim(p.username)) = r.username
  where r.username <> ''
),
by_email as (
  select r.subject, p.user_id, 'email' as matched_by
  from realm r
  join identity_user_profiles p on lower(btrim(p.email)) = r.email
  where r.email <> ''
    and not exists (select 1 from by_username u where u.subject = r.subject)
),
candidates as (
  select * from by_username
  union all
  select * from by_email
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
  total.service_accounts,
  links.by_username,
  links.by_email,
  links.ambiguous,
  total.realm_users - total.service_accounts - links.by_username - links.by_email - links.ambiguous
from (
  select
    count(*) as realm_users,
    count(*) filter (where username like 'service-account-%') as service_accounts
  from realm_users
) as total
cross join (
  select
    count(*) filter (where users = 1 and matched_by = 'username') as by_username,
    count(*) filter (where users = 1 and matched_by = 'email') as by_email,
    count(*) filter (where users > 1) as ambiguous
  from candidate_links
) as links;

commit;
