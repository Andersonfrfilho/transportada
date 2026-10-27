/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 T4b (RF8): a migration acrescenta `detected_email` e `detected_email_sent_at` à mensagem da conversa, nulas
 * e sem UPDATE. A CHECK aceita e-mail detectado só na recebida e a hora do envio só com e-mail detectado; o rollback
 * tira as duas colunas (e recusa com e-mail detectado gravado), e a migration reaplica.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_conversation_message_detected_email'
const CONSTRAINT = 'occurrence_conversation_messages_detected_email_check'

export type ConversationMessageDetectedEmailProbe = {
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
}

async function readRollback(directories: readonly string[]): Promise<null | string> {
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) return null
  return Bun.file(join(migrationsDirectory.pathname, directory, 'rollback.sql')).text()
}

async function readColumns(database: SQL): Promise<readonly string[]> {
  const rows = (await database`
    select column_name from information_schema.columns
     where table_name = 'occurrence_conversation_messages'
       and column_name in ('detected_email', 'detected_email_sent_at')
     order by column_name
  `) as readonly { readonly column_name: string }[]
  return rows.map((row) => row.column_name)
}

async function readConstraint(database: SQL): Promise<null | string> {
  const [row] = (await database`
    select pg_get_constraintdef(oid) as definition from pg_constraint where conname = ${CONSTRAINT}
  `) as readonly { readonly definition: string }[]
  return row?.definition ?? null
}

export async function assertConversationMessageDetectedEmail(
  probe: ConversationMessageDetectedEmailProbe,
): Promise<void> {
  const { connectionString, database, directories } = probe
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  const rollback = await readRollback(directories)
  if (directory === undefined || rollback === null) {
    throw new Error('conversation_message_detected_email is required')
  }
  expect(rollback).toContain('WHERE "detected_email" IS NOT NULL')
  expect(rollback).toContain('rollback recusado')
  expect(await readColumns(database)).toEqual(['detected_email', 'detected_email_sent_at'])
  const definition = await readConstraint(database)
  expect(definition).toContain("direction = 'inbound'")
  expect(definition).toContain('detected_email_sent_at IS NULL')

  await database.unsafe(rollback)
  expect(await readColumns(database)).toEqual([])
  expect(await readConstraint(database)).toBeNull()
  expect(await readMigrationNames(database)).not.toContain(directory)

  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)
  expect(await readColumns(database)).toEqual(['detected_email', 'detected_email_sent_at'])
  expect(await readConstraint(database)).not.toBeNull()
}

/** A mais nova: desfaz-se antes das outras da 279, que mexem em tabelas vizinhas. */
export async function rollbackConversationMessageDetectedEmail(
  database: SQL,
  directories: readonly string[],
): Promise<void> {
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  const rollback = await readRollback(directories)
  if (directory === undefined || rollback === null) return
  if (!(await readMigrationNames(database)).includes(directory)) return
  await database.unsafe(rollback)
}
