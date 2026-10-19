/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 274 T3.2 (D8, D12): a migration só derruba a CHECK que proibia o e-mail em `read`. O rollback recusa
 * enquanto houver mensagem `email`/`read` (não reescreve dado) e, sem ela, devolve a CHECK; a migration reaplica.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { expectQueryToFail, migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_conversation_email_read'
const CHECK_VIOLATION = '23514'
const NEVER_READ_CHECK = 'occurrence_conversation_messages_email_never_read_check'
const ROLLBACK_REFUSAL = 'existem mensagens de e-mail em status read'

export type ConversationEmailReadProbe = {
  readonly companyId: string
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
  readonly tripId: string
  readonly userId: string
}

async function insertEmailMessage(
  probe: ConversationEmailReadProbe,
  conversationId: string,
  status: string,
) {
  return probe.database`
    insert into occurrence_conversation_messages
      (company_id, conversation_id, channel, direction, author_user_id, status)
    values (${probe.companyId}, ${conversationId}, 'email', 'outbound', ${probe.userId}, ${status})
  `
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

export async function assertConversationEmailRead(
  probe: ConversationEmailReadProbe,
): Promise<void> {
  const { companyId, connectionString, database, directories, tripId, userId } = probe
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('occurrence_conversation_email_read is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()

  const [conversation] = (await database`
    insert into occurrence_conversations (company_id, subject_type, trip_id, participant, driver_user_id)
    values (${companyId}, 'trip', ${tripId}, 'driver', ${userId})
    returning id
  `) as { id: string }[]
  const conversationId = conversation?.id ?? ''

  await insertEmailMessage(probe, conversationId, 'read')
  expect((await runRollback(database, rollback))?.message).toContain(ROLLBACK_REFUSAL)
  expect(await readMigrationNames(database)).toContain(directory)

  await database`delete from occurrence_conversation_messages where conversation_id = ${conversationId}`
  await insertEmailMessage(probe, conversationId, 'delivered')
  expect(await runRollback(database, rollback)).toBeUndefined()
  expect(await readMigrationNames(database)).not.toContain(directory)
  await expectQueryToFail(
    insertEmailMessage(probe, conversationId, 'read'),
    CHECK_VIOLATION,
    NEVER_READ_CHECK,
  )

  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)
  await insertEmailMessage(probe, conversationId, 'read')
  await database`delete from occurrence_conversation_messages where conversation_id = ${conversationId}`
  await database`delete from occurrence_conversations where id = ${conversationId}`
}
