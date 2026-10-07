/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (revisão de segurança da Fase 4a, S3): o perfil aceita o texto literal que antecede o
 * número da carga, de 1 a 60 caracteres e sem controle; o rollback recusa (sem apagar) enquanto
 * algum perfil tiver o texto, e sem ele tira a coluna, sai do journal e a migration volta.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { expectQueryToFail, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_contractor_receiving_arrival_reference_label'
const CONSTRAINT = 'contractor_receiving_profiles_arrival_reference_label_check'
const CHECK_VIOLATION = '23514'

export type ArrivalReferenceLabelProbe = {
  readonly companyId: string
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
}

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

async function readLabelColumns(database: SQL): Promise<number> {
  const [row] = await database<{ count: number }[]>`
    select count(*)::int as count from information_schema.columns
    where table_name = 'contractor_receiving_profiles' and column_name = 'arrival_reference_label'
  `
  return row?.count ?? 0
}

export async function assertArrivalReferenceLabel(
  probe: ArrivalReferenceLabelProbe,
): Promise<void> {
  const { database } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined)
    throw new Error('contractor_receiving_arrival_reference_label is required')
  const contractorId = crypto.randomUUID()
  await database`
    insert into contractors (id, company_id, tax_id)
    values (${contractorId}, ${probe.companyId}, '30290856000160')
  `
  const setLabel = (label: string | null) => database`
    insert into contractor_receiving_profiles (company_id, contractor_id, arrival_reference_label)
    values (${probe.companyId}, ${contractorId}, ${label})
    on conflict (company_id, contractor_id) do update set arrival_reference_label = excluded.arrival_reference_label
  `
  await setLabel('NroCarga:')
  for (const label of ['', 'Nro\nCarga:', 'x'.repeat(61)]) {
    await expectQueryToFail(setLabel(label), CHECK_VIOLATION, CONSTRAINT)
  }

  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  expect((await runRollback(database, rollback))?.message).toContain('arrival_reference_label')
  expect(await readLabelColumns(database)).toBe(1)

  await setLabel(null)
  expect(await runRollback(database, rollback)).toBeUndefined()
  expect(await readLabelColumns(database)).toBe(0)
  await runDatabaseMigrations({ connectionString: probe.connectionString })
  expect(await readLabelColumns(database)).toBe(1)
  await database`delete from contractor_receiving_profiles where contractor_id = ${contractorId}`
  await database`delete from contractors where id = ${contractorId}`
}
