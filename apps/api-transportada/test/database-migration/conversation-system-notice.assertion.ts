/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 T6b (RF12): a migration acrescenta `system_notice` à mensagem da conversa (nula por padrão, nenhuma linha
 * antiga muda), com a CHECK que só deixa o aviso nascer automático e de saída, e um índice único por entrega. O
 * rollback tira os três e recusa com aviso gravado (conferido pelo texto; a linha real vive no teste de integração).
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_conversation_system_notice'
const CHECK = 'occurrence_conversation_messages_system_notice_check'
const INDEX = 'occurrence_conversation_messages_system_notice_delivery_unique'

export type ConversationSystemNoticeProbe = {
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
}

async function readShape(database: SQL): Promise<{
  readonly hasCheck: boolean
  readonly hasColumn: boolean
  readonly hasIndex: boolean
}> {
  const [column] = (await database`
    select data_type from information_schema.columns
     where table_name = 'occurrence_conversation_messages' and column_name = 'system_notice'
  `) as readonly { readonly data_type: string }[]
  const [check] =
    (await database`select 1 as found from pg_constraint where conname = ${CHECK}`) as readonly unknown[]
  const [index] =
    (await database`select 1 as found from pg_indexes where indexname = ${INDEX}`) as readonly unknown[]
  return {
    hasCheck: check !== undefined,
    hasColumn: column?.data_type === 'jsonb',
    hasIndex: index !== undefined,
  }
}

export async function assertConversationSystemNotice(
  probe: ConversationSystemNoticeProbe,
): Promise<void> {
  const { connectionString, database, directories } = probe
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('conversation_system_notice is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  expect(rollback).toContain('Refusing to drop system_notice')
  expect(await readShape(database)).toEqual({ hasCheck: true, hasColumn: true, hasIndex: true })

  await database.unsafe(rollback)
  expect(await readMigrationNames(database)).not.toContain(directory)
  expect(await readShape(database)).toEqual({ hasCheck: false, hasColumn: false, hasIndex: false })

  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)
  expect(await readShape(database)).toEqual({ hasCheck: true, hasColumn: true, hasIndex: true })
}
