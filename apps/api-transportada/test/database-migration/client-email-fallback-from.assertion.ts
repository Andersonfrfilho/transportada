/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 (RF4): a migration acrescenta `fallback_from` (a marca da queda do WhatsApp) na entrega do retorno, com a
 * CHECK que só aceita `whatsapp` no alvo do e-mail ao cliente. O rollback tira as duas. É a mais nova: roda antes de
 * qualquer outro rollback desta suíte.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_client_email_fallback_from'

export type ClientEmailFallbackFromProbe = {
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
}

async function readShape(database: SQL): Promise<{
  readonly hasCheck: boolean
  readonly hasColumn: boolean
}> {
  const [column] = (await database`
    select 1 as found from information_schema.columns
     where table_name = 'occurrence_contractor_reply_deliveries' and column_name = 'fallback_from'
  `) as readonly unknown[]
  const [check] = (await database`
    select 1 as found from pg_constraint
     where conname = 'occurrence_contractor_reply_deliveries_fallback_from_check'
  `) as readonly unknown[]
  return { hasCheck: check !== undefined, hasColumn: column !== undefined }
}

async function readRollback(directories: readonly string[]) {
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('client_email_fallback_from is required')
  return {
    directory,
    rollback: await Bun.file(join(migrationsDirectory.pathname, directory, 'rollback.sql')).text(),
  }
}

export async function assertClientEmailFallbackFrom(
  probe: ClientEmailFallbackFromProbe,
): Promise<void> {
  const { connectionString, database, directories } = probe
  const { directory, rollback } = await readRollback(directories)
  expect(await readShape(database)).toEqual({ hasCheck: true, hasColumn: true })

  await database.unsafe(rollback)
  expect(await readMigrationNames(database)).not.toContain(directory)
  expect(await readShape(database)).toEqual({ hasCheck: false, hasColumn: false })

  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)
  expect(await readShape(database)).toEqual({ hasCheck: true, hasColumn: true })
}

/** Para a 248 derrubar as tabelas do retorno: esta mexe na entrega, sai antes de todas. */
export async function rollbackClientEmailFallbackFrom(
  database: SQL,
  directories: readonly string[],
): Promise<void> {
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) return
  if (!(await readMigrationNames(database)).includes(directory)) return
  await database.unsafe((await readRollback(directories)).rollback)
}
