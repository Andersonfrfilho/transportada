/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 287 T006: a migration abre o fio de e-mail do cliente (`client_document_occurrence`, `client_stop_occurrence`)
 * na CHECK de `contractor_mail_threads.subject_type`. O rollback volta ao conjunto anterior. É a mais nova de todas.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_client_mail_thread'
const CHECK_NAME = 'contractor_mail_threads_subject_type_check'

export type ClientMailThreadProbe = {
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
}

async function readAcceptsClientThread(database: SQL): Promise<boolean> {
  const [row] = (await database`
    select pg_get_constraintdef(oid) as definition from pg_constraint where conname = ${CHECK_NAME}
  `) as readonly { readonly definition: string }[]
  return row?.definition.includes('client_document_occurrence') === true
}

export async function assertClientMailThread(probe: ClientMailThreadProbe): Promise<void> {
  const { connectionString, database, directories } = probe
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('client_mail_thread is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  expect(await readAcceptsClientThread(database)).toBe(true)

  await database.unsafe(rollback)
  expect(await readMigrationNames(database)).not.toContain(directory)
  expect(await readAcceptsClientThread(database)).toBe(false)

  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)
  expect(await readAcceptsClientThread(database)).toBe(true)
}
