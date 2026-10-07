/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T2.1 (ADR-0100 §3): o que a migration faz nas duas tabelas JÁ PUBLICADAS do calendário. A linha
 * importada nunca é, ao mesmo tempo, gerada por regra (`municipal_holidays`) e nunca é anual
 * (`state_holidays`); a FK para o cache é `RESTRICT`, porque a entrada nunca é apagada.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { expectQueryToFail } from './support.js'

const CHECK_VIOLATION = '23514'
const FOREIGN_KEY_VIOLATION = '23503'
const CAMPINAS = '3509502'
const SAO_PAULO_STATE = '35'

export const PARTIAL_INDEX_DEFINITIONS = [
  'CREATE INDEX municipal_holidays_provider_entry_idx ON public.municipal_holidays USING btree (company_id, provider_entry_id) WHERE (provider_entry_id IS NOT NULL)',
  'CREATE INDEX state_holidays_provider_entry_idx ON public.state_holidays USING btree (company_id, provider_entry_id) WHERE (provider_entry_id IS NOT NULL)',
] as const

export async function readPartialIndexDefinitions(database: SQL): Promise<readonly string[]> {
  const rows = await database<Array<{ readonly indexdef: string }>>`
    select indexdef from pg_indexes
    where indexname in ('municipal_holidays_provider_entry_idx', 'state_holidays_provider_entry_idx')
    order by indexname
  `
  return rows.map((row) => row.indexdef)
}

async function insertEntryId(database: SQL): Promise<string> {
  const [row] = await database<Array<{ readonly id: string }>>`
    insert into holiday_provider_entries (scope, ibge_code, holiday_on, name, provider_type)
    values ('city', ${CAMPINAS}, '2026-12-08', 'Imaculada Conceição', 'MUNICIPAL')
    returning id
  `
  if (row === undefined) throw new Error('entry was not inserted')
  return row.id
}

async function assertMunicipalHolidays(
  database: SQL,
  companyId: string,
  entryId: string,
): Promise<void> {
  const [rule] = await database<Array<{ readonly id: string }>>`
    insert into municipal_holiday_rules
      (company_id, city_ibge_code, month, day, kind, name, materialized_through_year)
    values (${companyId}, ${CAMPINAS}, 7, 14, 'city_anniversary', 'Aniversário de Campinas', 2036)
    returning id
  `
  const insertHoliday = (
    day: string,
    ruleId: string | null,
    providerEntryId: string | null,
  ) => database`
    insert into municipal_holidays (company_id, city_ibge_code, holiday_on, name, source_rule_id, provider_entry_id)
    values (${companyId}, ${CAMPINAS}, ${day}, 'Feriado', ${ruleId}, ${providerEntryId})
  `

  await insertHoliday('2026-12-08', null, entryId)
  await insertHoliday('2026-07-14', rule?.id ?? null, null)
  await insertHoliday('2026-09-20', null, null)
  await expectQueryToFail(
    insertHoliday('2026-12-09', null, crypto.randomUUID()),
    FOREIGN_KEY_VIOLATION,
    'municipal_holidays_provider_entry_fk',
  )
  await expectQueryToFail(
    insertHoliday('2026-12-10', rule?.id ?? null, entryId),
    CHECK_VIOLATION,
    'municipal_holidays_rule_or_provider_check',
  )
  await expectQueryToFail(
    database`delete from holiday_provider_entries where id = ${entryId}`,
    ['23001', FOREIGN_KEY_VIOLATION],
    'municipal_holidays_provider_entry_fk',
  )
  await database`delete from municipal_holidays where company_id = ${companyId}`
  await database`delete from municipal_holiday_rules where id = ${rule?.id ?? ''}`
}

async function assertStateHolidays(
  database: SQL,
  companyId: string,
  entryId: string,
): Promise<void> {
  const insertOnce = (day: string, providerEntryId: string | null) => database`
    insert into state_holidays (company_id, state_ibge_code, recurrence, holiday_on, name, provider_entry_id)
    values (${companyId}, ${SAO_PAULO_STATE}, 'once', ${day}, 'Feriado estadual', ${providerEntryId})
  `
  const insertYearly = (month: number, providerEntryId: string | null) => database`
    insert into state_holidays (company_id, state_ibge_code, recurrence, month, day, name, provider_entry_id)
    values (${companyId}, ${SAO_PAULO_STATE}, 'yearly', ${month}, 9, 'Feriado anual', ${providerEntryId})
  `

  await insertOnce('2026-07-09', entryId)
  await insertOnce('2026-12-08', null)
  await insertYearly(7, null)
  await expectQueryToFail(
    insertYearly(8, entryId),
    CHECK_VIOLATION,
    'state_holidays_provider_once_check',
  )
  await expectQueryToFail(
    insertOnce('2026-12-09', crypto.randomUUID()),
    FOREIGN_KEY_VIOLATION,
    'state_holidays_provider_entry_fk',
  )
  await expectQueryToFail(
    database`delete from holiday_provider_entries where id = ${entryId}`,
    ['23001', FOREIGN_KEY_VIOLATION],
    'state_holidays_provider_entry_fk',
  )
  await database`delete from state_holidays where company_id = ${companyId}`
}

export async function assertPublishedTables(database: SQL, companyId: string): Promise<void> {
  expect(await readPartialIndexDefinitions(database)).toEqual([...PARTIAL_INDEX_DEFINITIONS])
  const entryId = await insertEntryId(database)

  await assertMunicipalHolidays(database, companyId, entryId)
  await assertStateHolidays(database, companyId, entryId)
  await database`delete from holiday_provider_entries where id = ${entryId}`
}
