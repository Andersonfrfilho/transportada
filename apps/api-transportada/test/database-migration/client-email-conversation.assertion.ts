/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 287: a migration abre o participante `client_email` (a conversa de e-mail do cliente) nas CHECKs de
 * `occurrence_conversations`. O rollback volta ao conjunto da 283. É a mais nova de todas.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_client_email_conversation'
const CHECK_NAMES = [
  'occurrence_conversations_participant_check',
  'occurrence_conversations_participant_shape_check',
]

export type ClientEmailConversationProbe = {
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
}

async function readAcceptsClientEmail(database: SQL): Promise<boolean> {
  const rows = (await database`
    select pg_get_constraintdef(oid) as definition from pg_constraint where conname in ${database(CHECK_NAMES)}
  `) as readonly { readonly definition: string }[]
  return (
    rows.length === CHECK_NAMES.length &&
    rows.every((row) => row.definition.includes('client_email'))
  )
}

export async function assertClientEmailConversation(
  probe: ClientEmailConversationProbe,
): Promise<void> {
  const { connectionString, database, directories } = probe
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('client_email_conversation is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  expect(await readAcceptsClientEmail(database)).toBe(true)

  await database.unsafe(rollback)
  expect(await readMigrationNames(database)).not.toContain(directory)
  expect(await readAcceptsClientEmail(database)).toBe(false)

  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)
  expect(await readAcceptsClientEmail(database)).toBe(true)
}
