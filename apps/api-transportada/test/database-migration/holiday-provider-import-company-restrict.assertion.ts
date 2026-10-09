/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T2.2 (2ª rodada, revisão): as três tabelas por empresa seguram a empresa com `ON DELETE
 * RESTRICT` (empresa com dependente não se apaga em silêncio), o autor da supressão nunca é nulo, e o
 * índice da demanda é o que a busca ordenada por volume vai usar.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { expectQueryToFail } from './support.js'

const NOT_NULL_VIOLATION = '23502'
const CAMPINAS = '3509502'

const CITY_INDEX_DEFINITION =
  'CREATE INDEX holiday_import_cities_city_idx ON public.holiday_import_cities USING btree (city_ibge_code)'

type Dependent = {
  readonly constraint: string
  readonly create: (database: SQL, companyId: string) => Promise<unknown>
  readonly remove: (database: SQL, companyId: string) => Promise<unknown>
}

const DEPENDENTS: readonly Dependent[] = [
  {
    constraint: 'holiday_import_cities_company_id_companies_id_fk',
    create: (database, companyId) =>
      database`insert into holiday_import_cities (company_id, city_ibge_code) values (${companyId}, ${CAMPINAS})`,
    remove: (database, companyId) =>
      database`delete from holiday_import_cities where company_id = ${companyId}`,
  },
  {
    constraint: 'company_holiday_import_settings_company_id_companies_id_fk',
    create: (database, companyId) =>
      database`insert into company_holiday_import_settings (company_id) values (${companyId})`,
    remove: (database, companyId) =>
      database`delete from company_holiday_import_settings where company_id = ${companyId}`,
  },
  {
    constraint: 'holiday_import_suppressions_company_id_companies_id_fk',
    create: (database, companyId) => database`
      insert into holiday_import_suppressions (company_id, scope, ibge_code, holiday_on, suppressed_by_user_id)
      values (${companyId}, 'city', ${CAMPINAS}, '2040-04-04', ${crypto.randomUUID()})
    `,
    remove: (database, companyId) =>
      database`delete from holiday_import_suppressions where company_id = ${companyId}`,
  },
]

export async function assertCompanyForeignKeysRestrict(
  database: SQL,
  companyId: string,
): Promise<void> {
  for (const dependent of DEPENDENTS) {
    await dependent.create(database, companyId)
    await expectQueryToFail(
      database`delete from companies where id = ${companyId}`,
      ['23001', '23503'],
      dependent.constraint,
    )
    await dependent.remove(database, companyId)
  }
}

export async function assertCompanyTableDetails(database: SQL, companyId: string): Promise<void> {
  await expectQueryToFail(
    database`
      insert into holiday_import_suppressions (company_id, scope, ibge_code, holiday_on, suppressed_by_user_id)
      values (${companyId}, 'city', ${CAMPINAS}, '2040-04-05', null)
    `,
    NOT_NULL_VIOLATION,
  )
  const [index] = await database<Array<{ readonly indexdef: string }>>`
    select indexdef from pg_indexes where indexname = 'holiday_import_cities_city_idx'
  `
  expect(index?.indexdef).toBe(CITY_INDEX_DEFINITION)
}
