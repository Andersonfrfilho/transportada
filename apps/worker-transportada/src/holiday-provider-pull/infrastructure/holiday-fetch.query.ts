/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * As leituras e o contador da busca, em SQL cru. A fila é a própria `holiday_provider_fetches`: um par
 * sem linha, com `next_attempt_at` nulo ou já vencido é um par para buscar.
 */
import { sql, type SQL } from 'drizzle-orm'

import { timestamptzParameter } from '../../database/sql-timestamptz-parameter.support.js'

/**
 * Ordem: a paridade nacional (uma por ano, só se há demanda), os pares de estado que já existem e as
 * cidades pela soma de `document_count` decrescente. A demanda de empresa com a importação desligada
 * não conta.
 */
export function buildDuePairsQuery(input: {
  readonly limit: number
  readonly now: Date
  readonly years: readonly number[]
}): SQL {
  const horizon = sql.join(
    input.years.map((year) => sql`(${year}::int)`),
    sql`, `,
  )

  return sql`
    with horizon(year) as (values ${horizon}),
    enabled_demand as (
      select c.city_ibge_code as ibge_code, sum(c.document_count)::bigint as total
      from holiday_import_cities c
      left join company_holiday_import_settings s on s.company_id = c.company_id
      where coalesce(s.is_enabled, true)
      group by c.city_ibge_code
    ),
    candidates as (
      select 'national'::text as scope, 'BR'::text as ibge_code, h.year, 0 as sort_group, 0::bigint as total
      from horizon h
      where exists (select 1 from enabled_demand)
      union all
      select f.scope, f.ibge_code, f.year, 1, 0::bigint
      from holiday_provider_fetches f
      where f.scope = 'state' and f.year in (select year from horizon)
      union all
      select 'city'::text, d.ibge_code, h.year, 2, d.total
      from enabled_demand d cross join horizon h
    )
    select p.scope, p.ibge_code, p.year, coalesce(f.attempts, 0) as attempts
    from candidates p
    left join holiday_provider_fetches f
      on f.scope = p.scope and f.ibge_code = p.ibge_code and f.year = p.year
    where f.id is null or f.next_attempt_at is null or f.next_attempt_at <= ${timestamptzParameter(input.now)}
    order by p.sort_group, p.total desc, p.ibge_code, p.year
    limit ${input.limit}`
}

/**
 * Um **upsert**: o primeiro pedido do mês cria a linha. Um `UPDATE` cru não acharia linha e a rotina
 * pararia para sempre no dia 1º. Sem linha devolvida, o orçamento do mês foi atingido.
 */
export function buildClaimBudgetQuery(input: {
  readonly budget: number
  readonly month: string
}): SQL {
  return sql`
    insert into holiday_provider_monthly_usage (month, requests)
    values (${input.month}::date, 1)
    on conflict (month) do update
      set requests = holiday_provider_monthly_usage.requests + 1
      where holiday_provider_monthly_usage.requests < ${input.budget}
    returning requests`
}

export function buildEnsureStatePairQuery(input: {
  readonly stateCode: string
  readonly year: number
}): SQL {
  return sql`
    insert into holiday_provider_fetches (scope, ibge_code, year)
    values ('state', ${input.stateCode}, ${input.year})
    on conflict (scope, ibge_code, year) do nothing`
}

export function buildReadStatePairQuery(input: {
  readonly now: Date
  readonly stateCode: string
  readonly year: number
}): SQL {
  return sql`
    select attempts,
           (next_attempt_at is null or next_attempt_at <= ${timestamptzParameter(input.now)}) as is_due
    from holiday_provider_fetches
    where scope = 'state' and ibge_code = ${input.stateCode} and year = ${input.year}`
}
