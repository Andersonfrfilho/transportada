/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T8b (D13): a migration acrescenta `asks_client_contact` ao tipo da ocorrência. O padrão é `false` e nenhuma
 * linha antiga muda (a migration não liga a pergunta em tipo existente); o rollback tira a coluna sem recusa e a
 * migration reaplica. Aditiva e independente: nenhum outro rollback depende dela.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_asks_client_contact'

export type OccurrenceTypeAsksClientContactProbe = {
  readonly companyId: string
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
}

async function hasColumn(database: SQL): Promise<boolean> {
  const rows = (await database`
    select 1 from information_schema.columns
     where table_name = 'company_occurrence_types' and column_name = 'asks_client_contact'
  `) as readonly unknown[]
  return rows.length === 1
}

async function readAsks(database: SQL, typeId: string): Promise<boolean | undefined> {
  const [row] = (await database`
    select asks_client_contact as asks from company_occurrence_types where id = ${typeId}
  `) as readonly { readonly asks: boolean }[]
  return row?.asks
}

export async function assertOccurrenceTypeAsksClientContact(
  probe: OccurrenceTypeAsksClientContactProbe,
): Promise<void> {
  const { companyId, connectionString, database, directories } = probe
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('asks_client_contact is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  expect(await hasColumn(database)).toBe(true)

  const fresh = crypto.randomUUID()
  await database`
    insert into company_occurrence_types (id, company_id, name, stage)
    values (${fresh}, ${companyId}, ${`Prova 281 T8b ${fresh}`}, 'delivery')
  `
  expect(await readAsks(database, fresh)).toBe(false)
  await database`delete from company_occurrence_types where id = ${fresh}`

  await database.unsafe(rollback)
  expect(await hasColumn(database)).toBe(false)
  expect(await readMigrationNames(database)).not.toContain(directory)

  const existing = crypto.randomUUID()
  await database`
    insert into company_occurrence_types (id, company_id, name, stage)
    values (${existing}, ${companyId}, ${`Prova 281 T8b antigo ${existing}`}, 'delivery')
  `
  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)
  expect(await readAsks(database, existing)).toBe(false)
  await database`update company_occurrence_types set asks_client_contact = true where id = ${existing}`
  expect(await readAsks(database, existing)).toBe(true)
  await database`delete from company_occurrence_types where id = ${existing}`
}
