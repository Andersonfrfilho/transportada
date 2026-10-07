/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T2.1 (ADR-0100 §3): as três tabelas POR EMPRESA da importação — a demanda de cidades, o
 * cursor da descoberta e as supressões do operador. Todas referenciam só `companies`.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { expectQueryToFail } from './support.js'

const CHECK_VIOLATION = '23514'
const UNIQUE_VIOLATION = '23505'
const FOREIGN_KEY_VIOLATION = '23503'
const CAMPINAS = '3509502'
const SAO_PAULO_STATE = '35'

export type CompanyProbe = {
  readonly companyId: string
  readonly database: SQL
  readonly otherCompanyId: string
}

async function assertImportCities({
  companyId,
  database,
  otherCompanyId,
}: CompanyProbe): Promise<void> {
  const insertCity = (company: string, city: string, documentCount = 3) => database`
    insert into holiday_import_cities (company_id, city_ibge_code, document_count)
    values (${company}, ${city}, ${documentCount})
  `

  await insertCity(companyId, CAMPINAS)
  const [row] = await database<Array<{ readonly seen: boolean }>>`
    select (last_seen_at is not null) as seen from holiday_import_cities where company_id = ${companyId}
  `
  expect(row?.seen).toBeTrue()
  for (const city of ['350950', '6509502', '3509502x', 'abc', '']) {
    await expectQueryToFail(
      insertCity(companyId, city),
      CHECK_VIOLATION,
      'holiday_import_cities_city_check',
    )
  }
  await expectQueryToFail(
    insertCity(companyId, '3550308', -1),
    CHECK_VIOLATION,
    'holiday_import_cities_document_count_check',
  )
  await expectQueryToFail(
    insertCity(crypto.randomUUID(), CAMPINAS),
    FOREIGN_KEY_VIOLATION,
    'holiday_import_cities_company_id_companies_id_fk',
  )
  await expectQueryToFail(
    insertCity(companyId, CAMPINAS),
    UNIQUE_VIOLATION,
    'holiday_import_cities_pkey',
  )
  await insertCity(otherCompanyId, CAMPINAS)
  await database`delete from holiday_import_cities where company_id in ${database([companyId, otherCompanyId])}`
}

async function assertImportSettings({
  companyId,
  database,
  otherCompanyId,
}: CompanyProbe): Promise<void> {
  await database`insert into company_holiday_import_settings (company_id) values (${companyId})`
  const [defaults] = await database<
    Array<{ readonly cursor_document_id: string | null; readonly is_enabled: boolean }>
  >`select is_enabled, cursor_document_id from company_holiday_import_settings where company_id = ${companyId}`
  expect(defaults).toEqual({ cursor_document_id: null, is_enabled: true })

  const half = crypto.randomUUID()
  const partialCursors = [
    () =>
      database`update company_holiday_import_settings set cursor_updated_at = now() where company_id = ${companyId}`,
    () =>
      database`update company_holiday_import_settings set cursor_issued_at = now(), cursor_document_id = ${half} where company_id = ${companyId}`,
    () =>
      database`update company_holiday_import_settings set cursor_updated_at = now(), cursor_issued_at = now() where company_id = ${companyId}`,
    () =>
      database`update company_holiday_import_settings set cursor_document_id = ${half} where company_id = ${companyId}`,
  ]
  for (const statement of partialCursors) {
    await expectQueryToFail(
      statement(),
      CHECK_VIOLATION,
      'company_holiday_import_settings_cursor_check',
    )
  }
  await database`
    update company_holiday_import_settings
    set cursor_updated_at = now(), cursor_issued_at = now(), cursor_document_id = ${half}
    where company_id = ${companyId}
  `
  await database`
    update company_holiday_import_settings
    set cursor_updated_at = null, cursor_issued_at = null, cursor_document_id = null, is_enabled = false
    where company_id = ${companyId}
  `
  await expectQueryToFail(
    database`insert into company_holiday_import_settings (company_id) values (${crypto.randomUUID()})`,
    FOREIGN_KEY_VIOLATION,
    'company_holiday_import_settings_company_id_companies_id_fk',
  )
  await expectQueryToFail(
    database`insert into company_holiday_import_settings (company_id) values (${companyId})`,
    UNIQUE_VIOLATION,
    'company_holiday_import_settings_pkey',
  )
  await database`insert into company_holiday_import_settings (company_id) values (${otherCompanyId})`
  await database`delete from company_holiday_import_settings where company_id in ${database([companyId, otherCompanyId])}`
}

async function assertSuppressions({
  companyId,
  database,
  otherCompanyId,
}: CompanyProbe): Promise<void> {
  const insertSuppression = (
    company: string,
    scope: string,
    ibgeCode: string,
    day = '2026-12-08',
  ) => database`
    insert into holiday_import_suppressions (company_id, scope, ibge_code, holiday_on, suppressed_by_user_id)
    values (${company}, ${scope}, ${ibgeCode}, ${day}, ${crypto.randomUUID()})
  `

  await insertSuppression(companyId, 'city', CAMPINAS)
  await insertSuppression(companyId, 'state', SAO_PAULO_STATE)
  await expectQueryToFail(
    insertSuppression(companyId, 'national', 'BR', '2026-12-09'),
    CHECK_VIOLATION,
    'holiday_import_suppressions_scope_check',
  )
  for (const [scope, ibgeCode] of [
    ['city', SAO_PAULO_STATE],
    ['city', 'BR'],
    ['state', CAMPINAS],
    ['state', '34'],
  ] as const) {
    await expectQueryToFail(
      insertSuppression(companyId, scope, ibgeCode, '2026-12-09'),
      CHECK_VIOLATION,
      'holiday_import_suppressions_scope_code_check',
    )
  }
  await expectQueryToFail(
    insertSuppression(crypto.randomUUID(), 'city', CAMPINAS),
    FOREIGN_KEY_VIOLATION,
    'holiday_import_suppressions_company_id_companies_id_fk',
  )
  await expectQueryToFail(
    insertSuppression(companyId, 'city', CAMPINAS),
    UNIQUE_VIOLATION,
    'holiday_import_suppressions_company_scope_code_day_unique',
  )
  await insertSuppression(otherCompanyId, 'city', CAMPINAS)
  await insertSuppression(companyId, 'city', CAMPINAS, '2026-12-09')
  await database`delete from holiday_import_suppressions where company_id in ${database([companyId, otherCompanyId])}`
}

export async function assertCompanyTables(probe: CompanyProbe): Promise<void> {
  await assertImportCities(probe)
  await assertImportSettings(probe)
  await assertSuppressions(probe)
}
