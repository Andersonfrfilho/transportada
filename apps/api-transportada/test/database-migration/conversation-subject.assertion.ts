/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.3a (ADR-0101): a forma do assunto da conversa e o eco do `client_message_id` vivem no
 * banco. O rollback recusa enquanto houver conversa de nota ou de viagem, e sem elas devolve o
 * `NOT NULL` da ocorrência sem tocar a conversa de ocorrência que já existia; a migration reaplica.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { expectQueryToFail, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_conversation_subject'
const CHECK_VIOLATION = '23514'
const UNIQUE_VIOLATION = '23505'
const ROLLBACK_REFUSAL = 'conversas de nota/viagem existem'
const SHAPE_CHECK = 'occurrence_conversations_subject_shape_check'
const CLIENT_MESSAGE_ID = 'client-message-0001'

export type ConversationSubjectProbe = {
  readonly companyId: string
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
  readonly tripId: string
  readonly userId: string
}

async function insertTripConversation(probe: ConversationSubjectProbe, tripId: null | string) {
  return probe.database`
    insert into occurrence_conversations (company_id, subject_type, trip_id, participant, driver_user_id)
    values (${probe.companyId}, 'trip', ${tripId}, 'driver', ${probe.userId})
    returning id
  `
}

async function insertMessage(
  probe: ConversationSubjectProbe,
  conversationId: string,
  clientMessageId: null | string,
) {
  return probe.database`
    insert into occurrence_conversation_messages
      (company_id, conversation_id, channel, direction, author_user_id, status, client_message_id)
    values (${probe.companyId}, ${conversationId}, 'app', 'outbound', ${probe.userId}, 'queued', ${clientMessageId})
  `
}

async function insertUpload(
  probe: ConversationSubjectProbe,
  subject: { readonly conversationId: null | string; readonly occurrenceId: null | string },
) {
  const objectKey = `conversation-subject-probe/${crypto.randomUUID()}`
  return probe.database`
    insert into occurrence_conversation_uploads
      (company_id, occurrence_kind, occurrence_id, conversation_id, participant, channel,
       requested_by_user_id, bucket, object_key, declared_content_type, declared_size_bytes, expires_at)
    values (${probe.companyId}, ${subject.occurrenceId === null ? null : 'document'}, ${subject.occurrenceId},
       ${subject.conversationId}, 'driver', 'app', ${probe.userId}, 'probe-bucket', ${objectKey},
       'image/jpeg', 10, now() + interval '1 hour')
  `
}

async function assertShapeAndUniques(probe: ConversationSubjectProbe): Promise<string> {
  const { companyId, database, tripId, userId } = probe

  await expectQueryToFail(insertTripConversation(probe, null), CHECK_VIOLATION, SHAPE_CHECK)
  await expectQueryToFail(
    database`
      insert into occurrence_conversations
        (company_id, subject_type, occurrence_kind, occurrence_id, trip_id, participant, driver_user_id)
      values (${companyId}, 'occurrence', 'document', ${crypto.randomUUID()}, ${tripId}, 'driver', ${userId})
    `,
    CHECK_VIOLATION,
    SHAPE_CHECK,
  )
  await expectQueryToFail(
    database`
      insert into occurrence_conversations (company_id, subject_type, participant, driver_user_id)
      values (${companyId}, 'occurrence', 'driver', ${userId})
    `,
    CHECK_VIOLATION,
    SHAPE_CHECK,
  )
  await expectQueryToFail(
    database`
      insert into occurrence_conversations (company_id, subject_type, trip_id, participant, driver_user_id)
      values (${companyId}, 'sector', ${tripId}, 'driver', ${userId})
    `,
    CHECK_VIOLATION,
  )
  await expectQueryToFail(
    insertTripConversation(probe, crypto.randomUUID()),
    '23503',
    'occurrence_conversations_trip_fk',
  )

  const [created] = (await insertTripConversation(probe, tripId)) as { id: string }[]
  if (created === undefined) throw new Error('trip conversation was not created')
  await expectQueryToFail(
    insertTripConversation(probe, tripId),
    UNIQUE_VIOLATION,
    'occurrence_conversations_trip_subject_unique',
  )
  return created.id
}

async function assertMessageEcho(probe: ConversationSubjectProbe, conversationId: string) {
  await expectQueryToFail(insertMessage(probe, conversationId, 'short'), CHECK_VIOLATION)
  await expectQueryToFail(
    insertMessage(probe, conversationId, 'client message 0001'),
    CHECK_VIOLATION,
  )
  await expectQueryToFail(
    insertMessage(probe, conversationId, 'k'.repeat(257)),
    CHECK_VIOLATION,
    'occurrence_conversation_messages_client_message_id_check',
  )
  await insertMessage(probe, conversationId, 'k'.repeat(256))
  await insertMessage(probe, conversationId, null)
  await insertMessage(probe, conversationId, null)
  await insertMessage(probe, conversationId, CLIENT_MESSAGE_ID)
  await expectQueryToFail(
    insertMessage(probe, conversationId, CLIENT_MESSAGE_ID),
    UNIQUE_VIOLATION,
    'occurrence_conversation_messages_client_message_unique',
  )
}

async function assertUploadSubject(probe: ConversationSubjectProbe, conversationId: string) {
  const occurrenceId = crypto.randomUUID()
  await expectQueryToFail(
    insertUpload(probe, { conversationId, occurrenceId }),
    CHECK_VIOLATION,
    'occurrence_conversation_uploads_subject_check',
  )
  await expectQueryToFail(
    insertUpload(probe, { conversationId: null, occurrenceId: null }),
    CHECK_VIOLATION,
    'occurrence_conversation_uploads_subject_check',
  )
  await insertUpload(probe, { conversationId: null, occurrenceId })
  await insertUpload(probe, { conversationId, occurrenceId: null })
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

async function countSubjectColumns(database: SQL): Promise<number> {
  const [row] = await database<{ count: number }[]>`
    select count(*)::int as count from information_schema.columns
    where table_schema = 'public' and (
      (table_name = 'occurrence_conversations' and column_name in ('subject_type', 'trip_id', 'trip_document_id'))
      or (table_name = 'occurrence_conversation_messages' and column_name = 'client_message_id')
      or (table_name = 'occurrence_conversation_uploads' and column_name = 'conversation_id'))
  `
  return row?.count ?? 0
}

async function readNullableOccurrenceColumns(database: SQL): Promise<string[]> {
  const rows = (await database`
    select table_name || '.' || column_name as name from information_schema.columns
    where table_schema = 'public' and is_nullable = 'YES'
      and table_name in ('occurrence_conversations', 'occurrence_conversation_uploads')
      and column_name in ('occurrence_kind', 'occurrence_id')
  `) as { name: string }[]
  return rows.map((row) => row.name).toSorted()
}

export async function assertConversationSubject(probe: ConversationSubjectProbe): Promise<void> {
  const { companyId, database, userId } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('conversation_subject migration is required')

  const oldOccurrenceId = crypto.randomUUID()
  await database`
    insert into occurrence_conversations (company_id, occurrence_kind, occurrence_id, participant, driver_user_id)
    values (${companyId}, 'document', ${oldOccurrenceId}, 'driver', ${userId})
  `
  const conversationId = await assertShapeAndUniques(probe)
  await assertMessageEcho(probe, conversationId)
  await assertUploadSubject(probe, conversationId)
  expect(await countSubjectColumns(database)).toBe(5)

  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  expect((await runRollback(database, rollback))?.message).toContain(ROLLBACK_REFUSAL)
  expect(await countSubjectColumns(database)).toBe(5)

  await database`delete from occurrence_conversation_uploads where conversation_id is not null`
  expect((await runRollback(database, rollback))?.message).toContain(ROLLBACK_REFUSAL)

  await database`delete from occurrence_conversation_messages where conversation_id = ${conversationId}`
  await database`delete from occurrence_conversations where id = ${conversationId}`
  await database`delete from occurrence_conversation_uploads where company_id = ${companyId}`
  expect(await readNullableOccurrenceColumns(database)).toHaveLength(4)
  expect(await runRollback(database, rollback)).toBeUndefined()
  expect(await countSubjectColumns(database)).toBe(0)
  expect(await readNullableOccurrenceColumns(database)).toEqual([])
  const [kept] = (await database`
    select occurrence_kind from occurrence_conversations where occurrence_id = ${oldOccurrenceId}
  `) as { occurrence_kind: string }[]
  expect(kept).toEqual({ occurrence_kind: 'document' })

  await runDatabaseMigrations({ connectionString: probe.connectionString })
  expect(await countSubjectColumns(database)).toBe(5)
  const [reapplied] = (await database`
    select subject_type from occurrence_conversations where occurrence_id = ${oldOccurrenceId}
  `) as { subject_type: string }[]
  expect(reapplied).toEqual({ subject_type: 'occurrence' })
  await database`delete from occurrence_conversations where occurrence_id = ${oldOccurrenceId}`
}
