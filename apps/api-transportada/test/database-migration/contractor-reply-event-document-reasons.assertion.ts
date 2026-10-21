/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 278 D1: a migration só alarga a CHECK do motivo do evento do retorno (`document_confirmed`,
 * `document_without_text`). O rollback devolve a CHECK estreita e tira o diário; a migration reaplica. A recusa
 * com dado gravado está no próprio `rollback.sql` (o evento é append-only e pede um retorno inteiro para existir).
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_contractor_reply_event_document_reasons'

export type ContractorReplyEventDocumentReasonsProbe = {
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
}

async function readRollback(directories: readonly string[]): Promise<null | string> {
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) return null
  return Bun.file(join(migrationsDirectory.pathname, directory, 'rollback.sql')).text()
}

async function readEventReasonCheck(database: SQL): Promise<string> {
  const [row] = (await database`
    select pg_get_constraintdef(oid) as definition from pg_constraint
     where conname = 'occurrence_contractor_reply_events_reason_check'
  `) as readonly { readonly definition: string }[]
  return row?.definition ?? ''
}

export async function assertContractorReplyEventDocumentReasons(
  probe: ContractorReplyEventDocumentReasonsProbe,
): Promise<void> {
  const { connectionString, database, directories } = probe
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  const rollback = await readRollback(directories)
  if (directory === undefined || rollback === null) {
    throw new Error('contractor_reply_event_document_reasons is required')
  }
  expect(rollback).toContain('rollback recusado')
  expect(await readEventReasonCheck(database)).toContain('document_confirmed')
  expect(await readEventReasonCheck(database)).toContain('document_without_text')

  await database.unsafe(rollback)
  expect(await readMigrationNames(database)).not.toContain(directory)
  const narrowed = await readEventReasonCheck(database)
  expect(narrowed).not.toContain('document_confirmed')
  expect(narrowed).not.toContain('document_without_text')
  expect(narrowed).toContain('document_not_confirmed')

  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)
  expect(await readEventReasonCheck(database)).toContain('document_without_text')
}

/** Os rollbacks antigos recriam a CHECK do evento: desfaz-se primeiro a mais nova, que a alarga. */
export async function rollbackContractorReplyEventDocumentReasons(
  database: SQL,
  directories: readonly string[],
): Promise<void> {
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  const rollback = await readRollback(directories)
  if (directory === undefined || rollback === null) return
  if (!(await readMigrationNames(database)).includes(directory)) return
  await database.unsafe(rollback)
}
