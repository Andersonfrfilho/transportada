/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 276 T5: a migration acrescenta a resposta rápida do tipo (`contractor_reply_acknowledgement_quick_reply_id`, nula) e
 * o alvo `contractor_acknowledgement` na entrega do retorno. O rollback recusa enquanto um tipo usa a opção (não reescreve
 * dado) e, sem ela, tira a coluna e volta a CHECK; a migration reaplica.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_contractor_reply_acknowledgement'
const ROLLBACK_REFUSAL = 'Occurrence types still use the contractor acknowledgement'
const COLUMN = 'company_occurrence_types.contractor_reply_acknowledgement_quick_reply_id'

export type ContractorReplyAcknowledgementProbe = {
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

async function readColumnNames(database: SQL): Promise<readonly string[]> {
  const rows = (await database`
    select table_name || '.' || column_name as name
      from information_schema.columns
     where table_name = 'company_occurrence_types'
       and column_name = 'contractor_reply_acknowledgement_quick_reply_id'
  `) as readonly { readonly name: string }[]
  return rows.map((row) => row.name)
}

async function acceptsAcknowledgementTarget(database: SQL): Promise<boolean> {
  const [row] = (await database`
    select pg_get_constraintdef(oid) as definition from pg_constraint
     where conname = 'occurrence_contractor_reply_deliveries_target_check'
  `) as readonly { readonly definition: string }[]
  return row?.definition.includes('contractor_acknowledgement') ?? false
}

async function readRollback(directories: readonly string[]): Promise<null | string> {
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) return null
  return Bun.file(join(migrationsDirectory.pathname, directory, 'rollback.sql')).text()
}

export async function assertContractorReplyAcknowledgement(
  probe: ContractorReplyAcknowledgementProbe,
): Promise<void> {
  const { companyId, connectionString, database, directories } = probe
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  const rollback = await readRollback(directories)
  if (directory === undefined || rollback === null) {
    throw new Error('contractor_reply_acknowledgement is required')
  }
  expect(await readColumnNames(database)).toEqual([COLUMN])
  expect(await acceptsAcknowledgementTarget(database)).toBe(true)

  const typeId = crypto.randomUUID()
  await database`
    insert into company_occurrence_types (id, company_id, name, stage, contractor_reply_acknowledgement_quick_reply_id)
    values (${typeId}, ${companyId}, ${`Prova 276 T5 ${typeId}`}, 'delivery', ${crypto.randomUUID()})
  `
  expect((await runRollback(database, rollback))?.message).toContain(ROLLBACK_REFUSAL)
  expect(await readMigrationNames(database)).toContain(directory)

  await database`delete from company_occurrence_types where id = ${typeId}`
  expect(await runRollback(database, rollback)).toBeUndefined()
  expect(await readMigrationNames(database)).not.toContain(directory)
  expect(await readColumnNames(database)).toEqual([])
  expect(await acceptsAcknowledgementTarget(database)).toBe(false)

  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)
  expect(await readColumnNames(database)).toEqual([COLUMN])
  expect(await acceptsAcknowledgementTarget(database)).toBe(true)
}

/** O rollback da 248 apaga a tabela da entrega, cuja CHECK esta migration alarga: desfaz-se primeiro a mais nova. */
export async function rollbackContractorReplyAcknowledgement(
  database: SQL,
  directories: readonly string[],
): Promise<void> {
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  const rollback = await readRollback(directories)
  if (directory === undefined || rollback === null) return
  if (!(await readMigrationNames(database)).includes(directory)) return
  await database.unsafe(rollback)
}
