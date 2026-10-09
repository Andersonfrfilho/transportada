/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T2.2: as causas pelas quais o `rollback.sql` recusa. Cada uma sozinha — a recusa de uma não
 * pode ser mascarada pela presença de outra — e todas juntas.
 */
import type { SQL } from 'bun'

import { insertEntry } from './holiday-provider-import-cache.assertion.js'
import { JOB } from './holiday-provider-import.constant.js'

const CAMPINAS = '3509502'
const SAO_PAULO_STATE = '35'

/** Municipais importados, estaduais importados, supressões, empresas com a importação desligada, execuções abertas. */
export type RefusalCounts = readonly [number, number, number, number, number]

export type RefusalEntries = { readonly cityEntryId: string; readonly stateEntryId: string }

export type RefusalCause = {
  readonly counts: RefusalCounts
  readonly create: (entries: RefusalEntries) => Promise<void>
  readonly remove: () => Promise<void>
}

export type CauseProbe = {
  readonly companyId: string
  readonly database: SQL
  readonly userId: string
}

export function refusalMessage(counts: RefusalCounts): string {
  const [municipal, state, suppressions, disabled, executions] = counts
  return `Rollback recusado: ${municipal} feriado(s) municipal(is) importado(s), ${state} estadual(is) importado(s), ${suppressions} supressão(ões), ${disabled} empresa(s) com a importação desligada e ${executions} execução(ões) aberta(s)`
}

/** As entradas que as linhas importadas precisam referenciar (FK composta: mesma cidade/UF e mesmo dia). */
export async function insertRefusalEntries(database: SQL): Promise<RefusalEntries> {
  await insertEntry(database, { ibgeCode: CAMPINAS, scope: 'city' })
  await insertEntry(database, {
    holidayOn: '2026-07-09',
    ibgeCode: SAO_PAULO_STATE,
    providerType: 'ESTADUAL',
    scope: 'state',
  })
  const rows = await database<Array<{ readonly id: string; readonly scope: string }>>`
    select id, scope from holiday_provider_entries where scope in ('city', 'state')
  `
  const idOf = (scope: string): string => rows.find((row) => row.scope === scope)?.id ?? ''
  return { cityEntryId: idOf('city'), stateEntryId: idOf('state') }
}

export function buildRefusalCauses({
  companyId,
  database,
  userId,
}: CauseProbe): readonly RefusalCause[] {
  return [
    {
      counts: [1, 0, 0, 0, 0],
      create: async ({ cityEntryId }) => {
        await database`
          insert into municipal_holidays (company_id, city_ibge_code, holiday_on, name, provider_entry_id)
          values (${companyId}, ${CAMPINAS}, '2026-12-08', 'Importada', ${cityEntryId})
        `
      },
      remove: async () => {
        await database`delete from municipal_holidays where provider_entry_id is not null`
      },
    },
    {
      counts: [0, 1, 0, 0, 0],
      create: async ({ stateEntryId }) => {
        await database`
          insert into state_holidays (company_id, state_ibge_code, recurrence, holiday_on, name, provider_entry_id)
          values (${companyId}, ${SAO_PAULO_STATE}, 'once', '2026-07-09', 'Importada', ${stateEntryId})
        `
      },
      remove: async () => {
        await database`delete from state_holidays where provider_entry_id is not null`
      },
    },
    {
      counts: [0, 0, 1, 0, 0],
      create: async () => {
        await database`
          insert into holiday_import_suppressions (company_id, scope, ibge_code, holiday_on, suppressed_by_user_id)
          values (${companyId}, 'city', ${CAMPINAS}, '2026-12-09', ${userId})
        `
      },
      remove: async () => {
        await database`delete from holiday_import_suppressions`
      },
    },
    {
      counts: [0, 0, 0, 1, 0],
      create: async () => {
        await database`
          insert into company_holiday_import_settings (company_id, is_enabled) values (${companyId}, false)
        `
      },
      remove: async () => {
        await database`delete from company_holiday_import_settings`
      },
    },
    {
      counts: [0, 0, 0, 0, 1],
      create: async () => {
        await database`
          insert into job_executions (job, origin, correlation_id) values (${JOB}, 'schedule', 'holiday-probe')
        `
      },
      remove: async () => {
        await database`delete from job_executions where job = ${JOB}`
      },
    },
  ]
}
