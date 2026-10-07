/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T2.1 (ADR-0100 §3): o rollback recusa enquanto houver dado que a versão antiga não guarda — a
 * linha importada, a supressão do operador, a execução aberta da rotina — e, sem eles, devolve as listas
 * de `job`, deixa as datas digitadas onde estavam, tira o histórico da rotina e sai do journal.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { insertEntry } from './holiday-provider-import-cache.assertion.js'
import { JOB, MIGRATION_SUFFIX } from './holiday-provider-import.constant.js'
import { readImportState, type ImportState } from './holiday-provider-import-state.assertion.js'
import { migrationsDirectory, readMigrationNames } from './support.js'

const CAMPINAS = '3509502'
const SAO_PAULO_STATE = '35'

export type RollbackProbe = {
  readonly companyId: string
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
  readonly userId: string
}

async function readRollbackScript(directory: string): Promise<string> {
  return Bun.file(join(migrationsDirectory.pathname, directory, 'rollback.sql')).text()
}

/** O script abre `BEGIN`: a recusa deixa a transação abortada e o `ROLLBACK` tem de ir pela mesma conexão. */
async function runRollback(database: SQL, rollback: string): Promise<Error | undefined> {
  const reserved = await database.reserve()
  try {
    await reserved.unsafe(rollback)
    return undefined
  } catch (error) {
    await reserved.unsafe('ROLLBACK')
    return error as Error
  } finally {
    reserved.release()
  }
}

/**
 * Para as asserções de migrations ANTERIORES que desfazem objetos que esta usa (o CHECK de `job`, as
 * colunas do calendário): a posterior sai primeiro, e a reaplicação do fim delas a devolve.
 */
export async function rollbackHolidayProviderImportIfApplied(
  database: SQL,
  directories: readonly string[],
): Promise<void> {
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) return

  const failure = await runRollback(database, await readRollbackScript(directory))
  if (failure !== undefined) throw failure
}

type RefusalCounts = readonly [number, number, number, number]

function refusalMessage(counts: RefusalCounts): string {
  const [municipal, state, suppressions, executions] = counts
  return `Rollback recusado: ${municipal} feriado(s) municipal(is) importado(s), ${state} estadual(is) importado(s), ${suppressions} supressão(ões) e ${executions} execução(ões) aberta(s)`
}

/** Cada causa de recusa sozinha: a recusa de uma não pode ser mascarada pela presença de outra. */
type RefusalCause = {
  readonly counts: RefusalCounts
  readonly create: (entryId: string) => Promise<void>
  readonly remove: () => Promise<void>
}

function buildRefusalCauses(probe: RollbackProbe): readonly RefusalCause[] {
  const { companyId, database, userId } = probe
  return [
    {
      counts: [1, 0, 0, 0],
      create: async (entryId) => {
        await database`
          insert into municipal_holidays (company_id, city_ibge_code, holiday_on, name, provider_entry_id)
          values (${companyId}, ${CAMPINAS}, '2026-12-08', 'Importada', ${entryId})
        `
      },
      remove: async () => {
        await database`delete from municipal_holidays where provider_entry_id is not null`
      },
    },
    {
      counts: [0, 1, 0, 0],
      create: async (entryId) => {
        await database`
          insert into state_holidays (company_id, state_ibge_code, recurrence, holiday_on, name, provider_entry_id)
          values (${companyId}, ${SAO_PAULO_STATE}, 'once', '2026-07-09', 'Importada', ${entryId})
        `
      },
      remove: async () => {
        await database`delete from state_holidays where provider_entry_id is not null`
      },
    },
    {
      counts: [0, 0, 1, 0],
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
      counts: [0, 0, 0, 1],
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

async function assertRefused(
  probe: RollbackProbe,
  rollback: string,
  counts: RefusalCounts,
  applied: ImportState,
): Promise<void> {
  const failure = await runRollback(probe.database, rollback)

  expect(failure?.message).toContain(refusalMessage(counts))
  expect(await readImportState(probe.database)).toEqual(applied)
}

async function assertEveryCauseRefuses(
  probe: RollbackProbe,
  rollback: string,
  applied: ImportState,
): Promise<void> {
  const { database } = probe
  await insertEntry(database, { ibgeCode: CAMPINAS, scope: 'city' })
  const [entry] = await database<Array<{ readonly id: string }>>`
    select id from holiday_provider_entries where scope = 'city'
  `
  const entryId = entry?.id ?? ''
  const causes = buildRefusalCauses(probe)

  for (const cause of causes) {
    await cause.create(entryId)
    await assertRefused(probe, rollback, cause.counts, applied)
    await cause.remove()
  }
  for (const cause of causes) await cause.create(entryId)
  await assertRefused(probe, rollback, [1, 1, 1, 1], applied)
  for (const cause of causes) await cause.remove()
}

async function insertRowsTheRollbackMustKeep(probe: RollbackProbe): Promise<void> {
  const { companyId, database } = probe
  await database`
    insert into municipal_holidays (company_id, city_ibge_code, holiday_on, name)
    values (${companyId}, ${CAMPINAS}, '2026-09-20', 'Digitada')
  `
  await database`
    insert into state_holidays (company_id, state_ibge_code, recurrence, holiday_on, name)
    values (${companyId}, ${SAO_PAULO_STATE}, 'once', '2026-09-21', 'Digitada')
  `
  await database`
    insert into job_executions (job, origin, correlation_id, finished_at, outcome)
    values (${JOB}, 'schedule', 'holiday-probe', now(), 'succeeded')
  `
}

export async function assertHolidayProviderImportRollback(
  probe: RollbackProbe,
  applied: ImportState,
  rolledBack: ImportState,
): Promise<void> {
  const { companyId, connectionString, database, directories } = probe
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('holiday_provider_import migration is required')
  const rollback = await readRollbackScript(directory)

  await assertEveryCauseRefuses(probe, rollback, applied)
  expect(await readMigrationNames(database)).toContain(directory)

  await insertRowsTheRollbackMustKeep(probe)
  expect(await runRollback(database, rollback)).toBeUndefined()

  expect(await readImportState(database)).toEqual(rolledBack)
  expect(await readMigrationNames(database)).not.toContain(directory)
  const kept = await database<Array<{ readonly holiday_on: string }>>`
    select holiday_on::text from municipal_holidays where company_id = ${companyId}
    union all select holiday_on::text from state_holidays where company_id = ${companyId}
    order by 1
  `
  expect(kept.map((row) => row.holiday_on)).toEqual(['2026-09-20', '2026-09-21'])
  const [history] = await database<Array<{ readonly executions: number }>>`
    select count(*)::int as executions from job_executions where job = ${JOB}
  `
  expect(history?.executions).toBe(0)

  await runDatabaseMigrations({ connectionString })
  expect(await readImportState(database)).toEqual(applied)
  await database`delete from municipal_holidays where company_id = ${companyId}`
  await database`delete from state_holidays where company_id = ${companyId}`
}
