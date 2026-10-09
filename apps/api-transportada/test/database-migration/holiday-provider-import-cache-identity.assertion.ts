/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T2.2 (2ª rodada, revisão): o cache aceita só o que o resto do desenho assume. Colunas de
 * identidade nunca nulas (NULL é distinto de NULL e o único não seguraria), a identidade D2 é
 * `(escopo, ibge, data)` — o tipo e o `id` do fornecedor não a mudam —, o tipo da entrada combina com o
 * escopo, e os defaults e índices são os que a rotina da T3 vai assumir.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { insertEntry } from './holiday-provider-import-cache.assertion.js'
import { expectQueryToFail } from './support.js'

const NOT_NULL_VIOLATION = '23502'
const CHECK_VIOLATION = '23514'
const UNIQUE_VIOLATION = '23505'
const CAMPINAS = '3509502'
const SAO_PAULO_STATE = '35'
const NATIONAL = 'BR'

const FETCH_INDEX_DEFINITION =
  'CREATE INDEX holiday_provider_fetches_status_next_attempt_idx ON public.holiday_provider_fetches USING btree (status, next_attempt_at)'

async function assertFetchesRefuseNulls(database: SQL): Promise<void> {
  const attempts = [
    () =>
      database`insert into holiday_provider_fetches (scope, ibge_code, year) values (null, ${CAMPINAS}, 2040)`,
    () =>
      database`insert into holiday_provider_fetches (scope, ibge_code, year) values ('city', null, 2040)`,
    () =>
      database`insert into holiday_provider_fetches (scope, ibge_code, year) values ('city', ${CAMPINAS}, null)`,
    () =>
      database`insert into holiday_provider_fetches (scope, ibge_code, year) values ('national', null, 2040)`,
  ]
  for (const attempt of attempts) await expectQueryToFail(attempt(), NOT_NULL_VIOLATION)
}

async function assertEntriesRefuseNulls(database: SQL): Promise<void> {
  const attempts = [
    () =>
      database`insert into holiday_provider_entries (scope, ibge_code, holiday_on, name, provider_type) values (null, ${CAMPINAS}, '2040-01-01', 'F', 'MUNICIPAL')`,
    () =>
      database`insert into holiday_provider_entries (scope, ibge_code, holiday_on, name, provider_type) values ('city', null, '2040-01-01', 'F', 'MUNICIPAL')`,
    () =>
      database`insert into holiday_provider_entries (scope, ibge_code, holiday_on, name, provider_type) values ('city', ${CAMPINAS}, null, 'F', 'MUNICIPAL')`,
    () =>
      database`insert into holiday_provider_entries (scope, ibge_code, holiday_on, name, provider_type) values ('national', null, '2040-01-01', 'F', 'NACIONAL')`,
  ]
  for (const attempt of attempts) await expectQueryToFail(attempt(), NOT_NULL_VIOLATION)
}

/** D2: o mesmo `(escopo, ibge, data)` é a mesma data, seja qual for o tipo ou o `id` do fornecedor. */
async function assertEntryIdentityIsScopeCodeDay(database: SQL): Promise<void> {
  const key = { holidayOn: '2026-12-08', ibgeCode: CAMPINAS, scope: 'city' }

  await insertEntry(database, { ...key, externalId: 'a', holidayOn: '2040-02-02' })
  for (const duplicate of [
    { providerType: 'FACULTATIVO' },
    { externalId: 'outro-id', providerType: 'MUNICIPAL' },
  ]) {
    await expectQueryToFail(
      insertEntry(database, { ...key, ...duplicate, holidayOn: '2040-02-02' }),
      UNIQUE_VIOLATION,
      'holiday_provider_entries_scope_code_day_unique',
    )
  }
  await expectQueryToFail(
    insertEntry(database, { ...key, externalId: 'a', holidayOn: '2026-12-08' }),
    UNIQUE_VIOLATION,
    'holiday_provider_entries_scope_code_day_unique',
  )
}

/** Escopo × tipo: o que o fornecedor chama de estadual numa resposta de cidade é gravado como `state`. */
async function assertScopeTypeCoupling(database: SQL): Promise<void> {
  const incoherent = [
    ['city', CAMPINAS, 'ESTADUAL'],
    ['city', CAMPINAS, 'NACIONAL'],
    ['state', SAO_PAULO_STATE, 'MUNICIPAL'],
    ['state', SAO_PAULO_STATE, 'NACIONAL'],
    ['national', NATIONAL, 'MUNICIPAL'],
    ['national', NATIONAL, 'ESTADUAL'],
  ] as const

  for (const [scope, ibgeCode, providerType] of incoherent) {
    await expectQueryToFail(
      insertEntry(database, { holidayOn: '2040-03-03', ibgeCode, providerType, scope }),
      CHECK_VIOLATION,
      'holiday_provider_entries_scope_type_check',
    )
  }
}

async function assertDefaultsAndIndex(database: SQL): Promise<void> {
  await database`insert into holiday_provider_fetches (scope, ibge_code, year) values ('city', '3550308', 2040)`
  const [row] = await database<Array<{ readonly attempts: number; readonly status: string }>>`
    select status, attempts from holiday_provider_fetches where ibge_code = '3550308'
  `
  expect(row).toEqual({ attempts: 0, status: 'pending' })

  const [index] = await database<Array<{ readonly indexdef: string }>>`
    select indexdef from pg_indexes where indexname = 'holiday_provider_fetches_status_next_attempt_idx'
  `
  expect(index?.indexdef).toBe(FETCH_INDEX_DEFINITION)
}

export async function assertProviderCacheIdentity(database: SQL): Promise<void> {
  await assertFetchesRefuseNulls(database)
  await assertEntriesRefuseNulls(database)
  await assertEntryIdentityIsScopeCodeDay(database)
  await assertScopeTypeCoupling(database)
  await assertDefaultsAndIndex(database)
}
