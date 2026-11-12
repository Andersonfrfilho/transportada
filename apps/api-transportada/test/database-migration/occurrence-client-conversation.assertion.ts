/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 283 T2: a migration acrescenta o participante `client` (CHECKs só alargadas), `client_tax_id` na conversa,
 * `client_delivery_id`/`recipient_address` na mensagem com o único por entrega, e o gatilho que abre a conversa do
 * cliente no envio. O rollback tira tudo e recusa com conversa do cliente gravada (conferido pelo texto; a linha real
 * vive no teste de integração).
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_client_conversation'

export type OccurrenceClientConversationProbe = {
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
}

async function readShape(database: SQL): Promise<{
  readonly acceptsClient: boolean
  readonly columns: readonly string[]
  readonly hasIndex: boolean
  readonly hasTrigger: boolean
}> {
  const columns = (await database`
    select column_name from information_schema.columns
     where (table_name = 'occurrence_conversations' and column_name = 'client_tax_id')
        or (table_name = 'occurrence_conversation_messages'
            and column_name in ('client_delivery_id', 'recipient_address'))
     order by column_name
  `) as readonly { readonly column_name: string }[]
  const [check] = (await database`
    select pg_get_constraintdef(oid) as definition from pg_constraint
     where conname = 'occurrence_conversations_participant_check'
  `) as readonly { readonly definition: string }[]
  const [index] = (await database`
    select 1 as found from pg_indexes
     where indexname = 'occurrence_conversation_messages_client_delivery_unique'
  `) as readonly unknown[]
  const triggers = (await database`
    select tgrelid::regclass::text as found from pg_trigger where tgname = 'occurrence_client_conversation_sync_trigger'
  `) as readonly { readonly found: string }[]
  const [trigger] = triggers
  return {
    acceptsClient: check?.definition.includes("'client'") ?? false,
    columns: columns.map((row) => row.column_name),
    hasIndex: index !== undefined,
    hasTrigger: trigger !== undefined,
  }
}

const APPLIED = {
  acceptsClient: true,
  columns: ['client_delivery_id', 'client_tax_id', 'recipient_address'],
  hasIndex: true,
  hasTrigger: true,
}

export async function assertOccurrenceClientConversation(
  probe: OccurrenceClientConversationProbe,
): Promise<void> {
  const { connectionString, database, directories } = probe
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('occurrence_client_conversation is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  expect(rollback).toContain('Refusing to drop the client conversation')
  expect(await readShape(database)).toEqual(APPLIED)

  await database.unsafe(rollback)
  expect(await readMigrationNames(database)).not.toContain(directory)
  expect(await readShape(database)).toEqual({
    acceptsClient: false,
    columns: [],
    hasIndex: false,
    hasTrigger: false,
  })

  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)
  expect(await readShape(database)).toEqual(APPLIED)
}
