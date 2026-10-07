/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T2.1 (ADR-0100 §3): o que o banco recusa e aceita no cache GLOBAL do fornecedor de feriados.
 * O nacional vale `'BR'` e `ibge_code` nunca é nulo — é o que faz o único segurar.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { expectQueryToFail } from './support.js'

const CHECK_VIOLATION = '23514'
const UNIQUE_VIOLATION = '23505'
const CAMPINAS = '3509502'
const SAO_PAULO_STATE = '35'
const NATIONAL = 'BR'

type FetchValues = {
  readonly attempts?: number
  readonly ibgeCode: string
  readonly scope: string
  readonly status?: string
  readonly year?: number
}

type EntryValues = {
  readonly holidayOn?: string
  readonly ibgeCode: string
  readonly name?: string
  readonly providerType?: string
  readonly scope: string
}

const insertFetch = (database: SQL, values: FetchValues) => database`
  insert into holiday_provider_fetches (scope, ibge_code, year, status, attempts)
  values (${values.scope}, ${values.ibgeCode}, ${values.year ?? 2026}, ${values.status ?? 'pending'},
    ${values.attempts ?? 0})
`

export const insertEntry = (database: SQL, values: EntryValues) => database`
  insert into holiday_provider_entries (scope, ibge_code, holiday_on, name, provider_type)
  values (${values.scope}, ${values.ibgeCode}, ${values.holidayOn ?? '2026-12-08'},
    ${values.name ?? 'Feriado'}, ${values.providerType ?? 'MUNICIPAL'})
`

const BAD_SCOPE_CODES = [
  ['city', NATIONAL],
  ['city', '350950'],
  ['city', '3509502x'],
  ['city', '0509502'],
  ['city', SAO_PAULO_STATE],
  ['state', CAMPINAS],
  ['state', '34'],
  ['state', NATIONAL],
  ['national', SAO_PAULO_STATE],
  ['national', CAMPINAS],
  ['national', 'br'],
  ['national', ''],
] as const

async function assertFetches(database: SQL): Promise<void> {
  await insertFetch(database, { ibgeCode: CAMPINAS, scope: 'city' })
  await insertFetch(database, { ibgeCode: SAO_PAULO_STATE, scope: 'state' })
  await insertFetch(database, { ibgeCode: NATIONAL, scope: 'national' })
  const [row] = await database<
    Array<{ readonly last_error_code: string | null; readonly next_attempt_at: Date | null }>
  >`select last_error_code, next_attempt_at from holiday_provider_fetches where ibge_code = ${CAMPINAS}`
  expect(row).toEqual({ last_error_code: null, next_attempt_at: null })

  await expectQueryToFail(
    insertFetch(database, { ibgeCode: CAMPINAS, scope: 'region' }),
    CHECK_VIOLATION,
    'holiday_provider_fetches_scope_check',
  )
  for (const [scope, ibgeCode] of BAD_SCOPE_CODES) {
    await expectQueryToFail(
      insertFetch(database, { ibgeCode, scope, year: 2027 }),
      CHECK_VIOLATION,
      'holiday_provider_fetches_scope_code_check',
    )
  }
  for (const status of ['pending ', 'unknown', '']) {
    await expectQueryToFail(
      insertFetch(database, { ibgeCode: CAMPINAS, scope: 'city', status, year: 2027 }),
      CHECK_VIOLATION,
      'holiday_provider_fetches_status_check',
    )
  }
  for (const year of [1582, 10_000]) {
    await expectQueryToFail(
      insertFetch(database, { ibgeCode: CAMPINAS, scope: 'city', year }),
      CHECK_VIOLATION,
      'holiday_provider_fetches_year_check',
    )
  }
  await expectQueryToFail(
    insertFetch(database, { attempts: -1, ibgeCode: CAMPINAS, scope: 'city', year: 2027 }),
    CHECK_VIOLATION,
    'holiday_provider_fetches_attempts_check',
  )

  const statuses = ['pending', 'done', 'failed', 'quota_exhausted', 'not_covered']
  for (const [index, status] of statuses.entries()) {
    await insertFetch(database, { ibgeCode: CAMPINAS, scope: 'city', status, year: 2030 + index })
  }
  for (const values of [
    { ibgeCode: CAMPINAS, scope: 'city' },
    { ibgeCode: NATIONAL, scope: 'national' },
  ]) {
    await expectQueryToFail(
      insertFetch(database, values),
      UNIQUE_VIOLATION,
      'holiday_provider_fetches_scope_code_year_unique',
    )
  }
  await insertFetch(database, { ibgeCode: NATIONAL, scope: 'national', year: 2027 })
}

async function assertEntries(database: SQL): Promise<void> {
  await insertEntry(database, { ibgeCode: CAMPINAS, scope: 'city' })
  await insertEntry(database, {
    ibgeCode: SAO_PAULO_STATE,
    providerType: 'ESTADUAL',
    scope: 'state',
  })
  await insertEntry(database, { ibgeCode: NATIONAL, providerType: 'NACIONAL', scope: 'national' })
  const [row] = await database<
    Array<{
      readonly external_id: string | null
      readonly is_banking: boolean
      readonly removed_at: Date | null
    }>
  >`select external_id, is_banking, removed_at from holiday_provider_entries where scope = 'city'`
  expect(row).toEqual({ external_id: null, is_banking: false, removed_at: null })
  const [seen] = await database<Array<{ readonly seen: boolean }>>`
    select (first_seen_at is not null and last_seen_at is not null) as seen
    from holiday_provider_entries where scope = 'city'
  `
  expect(seen?.seen).toBeTrue()

  await expectQueryToFail(
    insertEntry(database, { ibgeCode: CAMPINAS, scope: 'region' }),
    CHECK_VIOLATION,
    'holiday_provider_entries_scope_check',
  )
  for (const [scope, ibgeCode] of BAD_SCOPE_CODES) {
    await expectQueryToFail(
      insertEntry(database, { holidayOn: '2026-12-09', ibgeCode, scope }),
      CHECK_VIOLATION,
      'holiday_provider_entries_scope_code_check',
    )
  }
  for (const providerType of ['municipal', 'OUTRO', '']) {
    await expectQueryToFail(
      insertEntry(database, {
        holidayOn: '2026-12-09',
        ibgeCode: CAMPINAS,
        providerType,
        scope: 'city',
      }),
      CHECK_VIOLATION,
      'holiday_provider_entries_provider_type_check',
    )
  }
  for (const name of ['', 'x'.repeat(121)]) {
    await expectQueryToFail(
      insertEntry(database, { holidayOn: '2026-12-09', ibgeCode: CAMPINAS, name, scope: 'city' }),
      CHECK_VIOLATION,
      'holiday_provider_entries_name_check',
    )
  }
  const providerTypes = ['NACIONAL', 'ESTADUAL', 'MUNICIPAL', 'FACULTATIVO']
  for (const [index, providerType] of providerTypes.entries()) {
    await insertEntry(database, {
      holidayOn: `2026-12-1${index}`,
      ibgeCode: CAMPINAS,
      name: 'x'.repeat(120),
      providerType,
      scope: 'city',
    })
  }
  for (const values of [
    { ibgeCode: CAMPINAS, scope: 'city' },
    { ibgeCode: NATIONAL, providerType: 'NACIONAL', scope: 'national' },
  ]) {
    await expectQueryToFail(
      insertEntry(database, values),
      UNIQUE_VIOLATION,
      'holiday_provider_entries_scope_code_day_unique',
    )
  }
}

async function assertMonthlyUsage(database: SQL): Promise<void> {
  await database`insert into holiday_provider_monthly_usage (month) values ('2026-10-01')`
  const [defaults] = await database<Array<{ readonly requests: number }>>`
    select requests from holiday_provider_monthly_usage where month = '2026-10-01'
  `
  expect(defaults?.requests).toBe(0)
  for (const month of ['2026-10-02', '2026-10-31']) {
    await expectQueryToFail(
      database`insert into holiday_provider_monthly_usage (month) values (${month})`,
      CHECK_VIOLATION,
      'holiday_provider_monthly_usage_month_check',
    )
  }
  await expectQueryToFail(
    database`insert into holiday_provider_monthly_usage (month, requests) values ('2026-11-01', -1)`,
    CHECK_VIOLATION,
    'holiday_provider_monthly_usage_requests_check',
  )
  await expectQueryToFail(
    database`insert into holiday_provider_monthly_usage (month) values ('2026-10-01')`,
    UNIQUE_VIOLATION,
    'holiday_provider_monthly_usage_pkey',
  )
}

/** O contador do ADR-0100 §3: o 1º pedido do mês cria a linha, e o teto nunca é ultrapassado. */
async function assertBudgetUpsert(database: SQL): Promise<void> {
  const increment = async (month: string, budget: number): Promise<number | undefined> => {
    const rows = await database<Array<{ readonly requests: number }>>`
      insert into holiday_provider_monthly_usage (month, requests) values (${month}, 1)
      on conflict (month) do update set requests = holiday_provider_monthly_usage.requests + 1
      where holiday_provider_monthly_usage.requests < ${budget}
      returning requests
    `
    return rows[0]?.requests
  }

  expect(await increment('2026-12-01', 2)).toBe(1)
  expect(await increment('2026-12-01', 2)).toBe(2)
  expect(await increment('2026-12-01', 2)).toBeUndefined()
  expect(await increment('2027-01-01', 2)).toBe(1)
}

export async function assertProviderCacheConstraints(database: SQL): Promise<void> {
  await assertFetches(database)
  await assertEntries(database)
  await assertMonthlyUsage(database)
  await assertBudgetUpsert(database)
}

export async function clearProviderCache(database: SQL): Promise<void> {
  await database`delete from holiday_provider_monthly_usage`
  await database`delete from holiday_provider_entries`
  await database`delete from holiday_provider_fetches`
}
