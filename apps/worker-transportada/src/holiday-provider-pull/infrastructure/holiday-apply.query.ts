/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A aplicação do cache no calendário da empresa, em SQL por conjunto. `ON CONFLICT DO NOTHING` é o que
 * faz a data digitada e a gerada por regra vencerem a importada (D3), e o que torna o ciclo repetido
 * uma operação sem escrita.
 */
import { sql, type SQL } from 'drizzle-orm'

/** Empresa ativa, com a importação ligada (sem linha de configuração vale ligada) e com demanda. */
export const LIST_APPLY_COMPANIES_QUERY: SQL = sql`
  select distinct c.company_id::text as company_id
  from holiday_import_cities c
  join companies co on co.id = c.company_id and co.status = 'active'
  left join company_holiday_import_settings s on s.company_id = c.company_id
  where coalesce(s.is_enabled, true)
  order by 1`

/**
 * O municipal vigente das cidades da empresa. Fica de fora: o facultativo (só cache, D5), o que o
 * fornecedor removeu, o que o operador desligou e qualquer data anterior a hoje (D7).
 */
export function buildApplyMunicipalQuery(input: {
  readonly companyId: string
  readonly today: string
}): SQL {
  return sql`
    insert into municipal_holidays (company_id, city_ibge_code, holiday_on, name, provider_entry_id)
    select c.company_id, e.ibge_code, e.holiday_on, e.name, e.id
    from holiday_import_cities c
    join holiday_provider_entries e on e.scope = 'city' and e.ibge_code = c.city_ibge_code
    where c.company_id = ${input.companyId}::uuid
      and e.provider_type = 'MUNICIPAL'
      and e.removed_at is null
      and e.holiday_on >= ${input.today}::date
      and not exists (
        select 1 from holiday_import_suppressions x
        where x.company_id = c.company_id and x.scope = 'city'
          and x.ibge_code = e.ibge_code and x.holiday_on = e.holiday_on)
    on conflict (company_id, city_ibge_code, holiday_on) do nothing
    returning id`
}

/**
 * O estadual vigente das UFs das cidades da empresa, como `once` marcado com a entrada (D6). O `once`
 * digitado na mesma data vence pelo `ON CONFLICT` sobre o predicado do único parcial; o `yearly`
 * digitado no mesmo dia e mês vence pelo `NOT EXISTS`.
 */
export function buildApplyStateQuery(input: {
  readonly companyId: string
  readonly today: string
}): SQL {
  return sql`
    insert into state_holidays (company_id, state_ibge_code, recurrence, holiday_on, name, provider_entry_id)
    select ${input.companyId}::uuid, e.ibge_code, 'once', e.holiday_on, e.name, e.id
    from holiday_provider_entries e
    where e.scope = 'state'
      and e.provider_type = 'ESTADUAL'
      and e.removed_at is null
      and e.holiday_on >= ${input.today}::date
      and e.ibge_code in (
        select left(c.city_ibge_code, 2) from holiday_import_cities c
        where c.company_id = ${input.companyId}::uuid)
      and not exists (
        select 1 from holiday_import_suppressions x
        where x.company_id = ${input.companyId}::uuid and x.scope = 'state'
          and x.ibge_code = e.ibge_code and x.holiday_on = e.holiday_on)
      and not exists (
        select 1 from state_holidays y
        where y.company_id = ${input.companyId}::uuid and y.state_ibge_code = e.ibge_code
          and y.recurrence = 'yearly'
          and y.month = extract(month from e.holiday_on)::int
          and y.day = extract(day from e.holiday_on)::int)
    on conflict (company_id, state_ibge_code, holiday_on) where recurrence = 'once' do nothing
    returning id`
}

/** O `NACIONAL` vigente por ano, só dos anos com a busca nacional concluída (`done`). */
export function buildReadNationalDatesQuery(years: readonly number[]): SQL {
  const list = sql.join(
    years.map((year) => sql`${year}::int`),
    sql`, `,
  )

  return sql`
    select extract(year from e.holiday_on)::int as year, e.holiday_on::text as holiday_on
    from holiday_provider_entries e
    where e.scope = 'national' and e.ibge_code = 'BR' and e.provider_type = 'NACIONAL'
      and e.removed_at is null
      and extract(year from e.holiday_on)::int in (${list})
      and exists (
        select 1 from holiday_provider_fetches f
        where f.scope = 'national' and f.ibge_code = 'BR'
          and f.year = extract(year from e.holiday_on)::int and f.status = 'done')
    order by e.holiday_on`
}
