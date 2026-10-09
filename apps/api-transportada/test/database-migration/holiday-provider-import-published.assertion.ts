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
const SAO_PAULO_CITY = '3550308'

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

type EntryIds = {
  readonly cityEntryId: string
  readonly otherCityEntryId: string
  readonly stateEntryId: string
}

async function insertEntryId(
  database: SQL,
  entry: { code: string; day: string; scope: string; type: string },
): Promise<string> {
  const [row] = await database<Array<{ readonly id: string }>>`
    insert into holiday_provider_entries (scope, ibge_code, holiday_on, name, provider_type)
    values (${entry.scope}, ${entry.code}, ${entry.day}, 'Feriado do fornecedor', ${entry.type})
    returning id
  `
  if (row === undefined) throw new Error('entry was not inserted')
  return row.id
}

/** A linha importada é a data da entrada: mesma cidade (ou UF) e mesmo dia, ou o banco recusa (FK composta). */
async function assertMunicipalHolidays(
  database: SQL,
  companyId: string,
  entries: EntryIds,
): Promise<void> {
  const { cityEntryId, otherCityEntryId, stateEntryId } = entries
  const [rule] = await database<Array<{ readonly id: string }>>`
    insert into municipal_holiday_rules
      (company_id, city_ibge_code, month, day, kind, name, materialized_through_year)
    values (${companyId}, ${CAMPINAS}, 7, 14, 'city_anniversary', 'Aniversário de Campinas', 2036)
    returning id
  `
  const insertHoliday = (
    cityCode: string,
    day: string,
    ruleId: string | null,
    providerEntryId: string | null,
  ) => database`
    insert into municipal_holidays (company_id, city_ibge_code, holiday_on, name, source_rule_id, provider_entry_id)
    values (${companyId}, ${cityCode}, ${day}, 'Feriado', ${ruleId}, ${providerEntryId})
  `
  const refusedByForeignKey = (cityCode: string, day: string, entryId: string) =>
    expectQueryToFail(
      insertHoliday(cityCode, day, null, entryId),
      FOREIGN_KEY_VIOLATION,
      'municipal_holidays_provider_entry_fk',
    )

  await insertHoliday(CAMPINAS, '2026-12-08', null, cityEntryId)
  await insertHoliday(SAO_PAULO_CITY, '2026-12-08', null, otherCityEntryId)
  await insertHoliday(CAMPINAS, '2026-07-14', rule?.id ?? null, null)
  await insertHoliday(CAMPINAS, '2026-09-20', null, null)
  await refusedByForeignKey(CAMPINAS, '2026-12-09', crypto.randomUUID())
  await refusedByForeignKey(SAO_PAULO_CITY, '2026-12-10', cityEntryId)
  await refusedByForeignKey(CAMPINAS, '2026-12-10', cityEntryId)
  await refusedByForeignKey(CAMPINAS, '2026-07-09', stateEntryId)
  await expectQueryToFail(
    insertHoliday(CAMPINAS, '2026-12-10', rule?.id ?? null, cityEntryId),
    CHECK_VIOLATION,
    'municipal_holidays_rule_or_provider_check',
  )
  await expectQueryToFail(
    database`delete from holiday_provider_entries where id = ${cityEntryId}`,
    ['23001', FOREIGN_KEY_VIOLATION],
    'municipal_holidays_provider_entry_fk',
  )
  await database`delete from municipal_holidays where company_id = ${companyId}`
  await database`delete from municipal_holiday_rules where id = ${rule?.id ?? ''}`
}

async function assertStateHolidays(
  database: SQL,
  companyId: string,
  entries: EntryIds,
): Promise<void> {
  const { cityEntryId, stateEntryId } = entries
  const insertOnce = (stateCode: string, day: string, providerEntryId: string | null) => database`
    insert into state_holidays (company_id, state_ibge_code, recurrence, holiday_on, name, provider_entry_id)
    values (${companyId}, ${stateCode}, 'once', ${day}, 'Feriado estadual', ${providerEntryId})
  `
  const insertYearly = (month: number, providerEntryId: string | null) => database`
    insert into state_holidays (company_id, state_ibge_code, recurrence, month, day, name, provider_entry_id)
    values (${companyId}, ${SAO_PAULO_STATE}, 'yearly', ${month}, 9, 'Feriado anual', ${providerEntryId})
  `
  const refusedByForeignKey = (stateCode: string, day: string, entryId: string) =>
    expectQueryToFail(
      insertOnce(stateCode, day, entryId),
      FOREIGN_KEY_VIOLATION,
      'state_holidays_provider_entry_fk',
    )

  await insertOnce(SAO_PAULO_STATE, '2026-07-09', stateEntryId)
  await insertOnce(SAO_PAULO_STATE, '2026-11-20', null)
  await insertYearly(7, null)
  await expectQueryToFail(
    insertYearly(8, stateEntryId),
    CHECK_VIOLATION,
    'state_holidays_provider_once_check',
  )
  await refusedByForeignKey(SAO_PAULO_STATE, '2026-12-09', crypto.randomUUID())
  // A linha estadual de SP ligada à entrada de Campinas (mesmo dia, outro escopo): a FK composta recusa.
  await refusedByForeignKey(SAO_PAULO_STATE, '2026-12-08', cityEntryId)
  await refusedByForeignKey('41', '2026-07-09', stateEntryId)
  await refusedByForeignKey(SAO_PAULO_STATE, '2026-07-10', stateEntryId)
  await expectQueryToFail(
    database`delete from holiday_provider_entries where id = ${stateEntryId}`,
    ['23001', FOREIGN_KEY_VIOLATION],
    'state_holidays_provider_entry_fk',
  )
  await database`delete from state_holidays where company_id = ${companyId}`
}

export async function assertPublishedTables(database: SQL, companyId: string): Promise<void> {
  expect(await readPartialIndexDefinitions(database)).toEqual([...PARTIAL_INDEX_DEFINITIONS])
  const entries: EntryIds = {
    cityEntryId: await insertEntryId(database, {
      code: CAMPINAS,
      day: '2026-12-08',
      scope: 'city',
      type: 'MUNICIPAL',
    }),
    otherCityEntryId: await insertEntryId(database, {
      code: SAO_PAULO_CITY,
      day: '2026-12-08',
      scope: 'city',
      type: 'MUNICIPAL',
    }),
    stateEntryId: await insertEntryId(database, {
      code: SAO_PAULO_STATE,
      day: '2026-07-09',
      scope: 'state',
      type: 'ESTADUAL',
    }),
  }

  await assertMunicipalHolidays(database, companyId, entries)
  await assertStateHolidays(database, companyId, entries)
  await database`delete from holiday_provider_entries`
}
