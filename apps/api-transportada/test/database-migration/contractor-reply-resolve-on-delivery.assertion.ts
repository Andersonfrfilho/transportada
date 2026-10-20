/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 276 T3b: a migration acrescenta a opção do tipo (`contractor_reply_resolve_on_delivery`, desligada) e a causa
 * `contractor_reply_id` no andamento. O rollback recusa enquanto um tipo usa a opção (não reescreve dado) e, sem ela,
 * tira as duas colunas; a migration reaplica.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_contractor_reply_resolve_on_delivery'
const ROLLBACK_REFUSAL = 'existem tipos de ocorrência que fecham sozinhos ao entregar'

export type ContractorReplyResolveOnDeliveryProbe = {
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
     where (table_name = 'company_occurrence_types' and column_name = 'contractor_reply_resolve_on_delivery')
        or (table_name = 'trip_occurrence_resolution_events' and column_name = 'contractor_reply_id')
     order by 1
  `) as readonly { readonly name: string }[]
  return rows.map((row) => row.name)
}

const COLUMNS = [
  'company_occurrence_types.contractor_reply_resolve_on_delivery',
  'trip_occurrence_resolution_events.contractor_reply_id',
]

export async function assertContractorReplyResolveOnDelivery(
  probe: ContractorReplyResolveOnDeliveryProbe,
): Promise<void> {
  const { companyId, connectionString, database, directories } = probe
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('contractor_reply_resolve_on_delivery is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  expect(await readColumnNames(database)).toEqual(COLUMNS)

  const typeId = crypto.randomUUID()
  await database`
    insert into company_occurrence_types (id, company_id, name, stage, contractor_reply_resolve_on_delivery)
    values (${typeId}, ${companyId}, ${`Prova 276 T3b ${typeId}`}, 'delivery', true)
  `
  expect((await runRollback(database, rollback))?.message).toContain(ROLLBACK_REFUSAL)
  expect(await readMigrationNames(database)).toContain(directory)

  await database`delete from company_occurrence_types where id = ${typeId}`
  expect(await runRollback(database, rollback)).toBeUndefined()
  expect(await readMigrationNames(database)).not.toContain(directory)
  expect(await readColumnNames(database)).toEqual([])

  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)
  expect(await readColumnNames(database)).toEqual(COLUMNS)
}

/**
 * O rollback da 248 apaga a tabela do retorno, que a FK da T3b referencia: desfaz-se primeiro a mais nova, como
 * em produção. A reaplicação da 248 traz as duas de volta.
 */
export async function rollbackContractorReplyResolveOnDelivery(
  database: SQL,
  directories: readonly string[],
): Promise<void> {
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) return
  if (!(await readMigrationNames(database)).includes(directory)) return
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  await database.unsafe(rollback)
}
