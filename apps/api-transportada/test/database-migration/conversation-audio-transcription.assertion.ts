/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.1 (contract.md §5.5), contra Postgres real: as duas tabelas da transcrição nascem com os CHECKs
 * do contrato (status, `failure_code` fechado, `too_long` ⇔ teto, texto de 20 000 caracteres, `ready` ⇔
 * `generated_at`), a FK composta prende a empresa e a unicidade é por anexo; o rollback derruba as duas
 * tabelas e o índice parcial, fecha o journal, e a migration reaplica.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { expectQueryToFail, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_conversation_audio_transcription'
const CHECK_VIOLATION = '23514'
const UNIQUE_VIOLATION = '23505'
const FOREIGN_KEY_VIOLATION = '23503'
const TABLE_PREFIX = 'occurrence_conversation_audio_transcriptions'
const ZERO_SHA256 = '0'.repeat(64)

export type ConversationAudioTranscriptionProbe = {
  readonly companyId: string
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
  readonly userId: string
}

type Fixture = { readonly attachmentId: string; readonly conversationId: string }

async function createFixture(probe: ConversationAudioTranscriptionProbe): Promise<Fixture> {
  const { companyId, database, userId } = probe
  const [conversation] = (await database`
    insert into occurrence_conversations (company_id, occurrence_kind, occurrence_id, participant, driver_user_id)
    values (${companyId}, 'document', ${crypto.randomUUID()}, 'driver', ${userId})
    returning id
  `) as { id: string }[]
  const [message] = (await database`
    insert into occurrence_conversation_messages
      (company_id, conversation_id, channel, direction, author_user_id, status)
    values (${companyId}, ${conversation?.id}, 'app', 'outbound', ${userId}, 'queued')
    returning id
  `) as { id: string }[]
  const objectId = crypto.randomUUID()
  await database`
    insert into stored_objects (
      id, company_id, provider, bucket, object_key, mime_type, size_bytes, sha256, status, purpose
    ) values (
      ${objectId}, ${companyId}, 's3', 'operational', ${`audio-transcription-probe/${objectId}`},
      'audio/ogg', 1024, ${ZERO_SHA256}, 'final', 'occurrence_conversation_attachment'
    )
  `
  const [attachment] = (await database`
    insert into occurrence_conversation_attachments
      (company_id, message_id, stored_object_id, sha256, size_bytes, content_type, duration_ms)
    values (${companyId}, ${message?.id}, ${objectId}, ${ZERO_SHA256}, 1024, 'audio/ogg', 4000)
    returning id
  `) as { id: string }[]
  if (conversation === undefined || attachment === undefined) throw new Error('fixture failed')
  return { attachmentId: attachment.id, conversationId: conversation.id }
}

function insertTranscription(
  probe: ConversationAudioTranscriptionProbe,
  fixture: Fixture,
  columns: Readonly<Record<string, unknown>>,
) {
  const { database } = probe
  const row = {
    attachment_id: fixture.attachmentId,
    company_id: probe.companyId,
    conversation_id: fixture.conversationId,
    status: 'pending',
    ...columns,
  }
  return database`insert into occurrence_conversation_audio_transcriptions ${database(row)} returning id`
}

async function clearTranscriptions(
  probe: ConversationAudioTranscriptionProbe,
  fixture: Fixture,
): Promise<void> {
  await probe.database`delete from occurrence_conversation_audio_transcriptions where attachment_id = ${fixture.attachmentId}`
}

async function assertChecksAndKeys(
  probe: ConversationAudioTranscriptionProbe,
  fixture: Fixture,
): Promise<void> {
  const readyAt = new Date()

  expect(await insertTranscription(probe, fixture, {})).toHaveLength(1)
  await expectQueryToFail(insertTranscription(probe, fixture, {}), UNIQUE_VIOLATION)
  await clearTranscriptions(probe, fixture)

  const refusals: readonly (readonly [Record<string, unknown>, string])[] = [
    [{ status: 'disabled' }, `${TABLE_PREFIX}_status_check`],
    [{ status: 'failed' }, `${TABLE_PREFIX}_failed_code_check`],
    [{ failure_code: 'bogus', status: 'failed' }, `${TABLE_PREFIX}_failure_code_check`],
    [{ status: 'ready' }, `${TABLE_PREFIX}_generated_check`],
    [{ generated_at: readyAt, status: 'pending' }, `${TABLE_PREFIX}_generated_check`],
    [{ audio_duration_ms: 0 }, `${TABLE_PREFIX}_duration_check`],
    [{ failure_code: 'too_long', status: 'failed' }, `${TABLE_PREFIX}_max_duration_check`],
    [
      { failure_code: 'empty_audio', max_duration_ms: 600000, status: 'failed' },
      `${TABLE_PREFIX}_max_duration_check`,
    ],
    [{ max_duration_ms: 600000 }, `${TABLE_PREFIX}_max_duration_check`],
    [
      { generated_at: readyAt, status: 'ready', text: 'é'.repeat(20_001) },
      `${TABLE_PREFIX}_text_length_check`,
    ],
  ]
  for (const [columns, constraint] of refusals) {
    await expectQueryToFail(
      insertTranscription(probe, fixture, columns),
      CHECK_VIOLATION,
      constraint,
    )
  }

  const accepted: readonly Record<string, unknown>[] = [
    { failure_code: 'too_long', max_duration_ms: 600000, status: 'failed' },
    { failure_code: 'company_disabled', status: 'failed' },
    { generated_at: readyAt, status: 'ready', text: 'é'.repeat(20_000) },
  ]
  for (const columns of accepted) {
    expect(await insertTranscription(probe, fixture, columns)).toHaveLength(1)
    await clearTranscriptions(probe, fixture)
  }

  await expectQueryToFail(
    insertTranscription(probe, fixture, { attachment_id: crypto.randomUUID() }),
    FOREIGN_KEY_VIOLATION,
    `${TABLE_PREFIX}_attachment_fk`,
  )
  await expectQueryToFail(
    insertTranscription(probe, fixture, { conversation_id: crypto.randomUUID() }),
    FOREIGN_KEY_VIOLATION,
    `${TABLE_PREFIX}_conversation_fk`,
  )
}

async function assertSettings(probe: ConversationAudioTranscriptionProbe): Promise<void> {
  const { companyId, database } = probe
  await database`insert into company_audio_transcription_settings (company_id) values (${companyId})`
  const [row] = (await database`
    select enabled, routine_started_at, updated_by_user_id, enabled_since is not null as has_since
    from company_audio_transcription_settings where company_id = ${companyId}
  `) as {
    enabled: boolean
    has_since: boolean
    routine_started_at: Date | null
    updated_by_user_id: string | null
  }[]
  expect(row).toEqual({
    enabled: true,
    has_since: true,
    routine_started_at: null,
    updated_by_user_id: null,
  })
  await expectQueryToFail(
    database`insert into company_audio_transcription_settings (company_id) values (${crypto.randomUUID()})`,
    FOREIGN_KEY_VIOLATION,
  )
}

async function countObjects(database: SQL): Promise<number> {
  const [row] = (await database`
    select (
      (select count(*) from information_schema.tables where table_schema = 'public'
        and table_name in ('occurrence_conversation_audio_transcriptions', 'company_audio_transcription_settings'))
      + (select count(*) from pg_indexes where schemaname = 'public'
        and indexname = 'occurrence_conversation_attachments_audio_created_idx')
    )::int as count
  `) as { count: number }[]
  return row?.count ?? -1
}

async function countJournal(database: SQL, directory: string): Promise<number> {
  const [row] = (await database`
    select count(*)::int as count from drizzle.__drizzle_migrations where name = ${directory}`) as {
    count: number
  }[]
  return row?.count ?? -1
}

export async function assertConversationAudioTranscription(
  probe: ConversationAudioTranscriptionProbe,
): Promise<void> {
  const { companyId, connectionString, database } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) {
    throw new Error('conversation_audio_transcription migration is required')
  }

  const fixture = await createFixture(probe)
  await assertChecksAndKeys(probe, fixture)
  await assertSettings(probe)
  expect(await countObjects(database)).toBe(3)

  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  await database.unsafe(rollback)
  expect(await countObjects(database)).toBe(0)
  expect(await countJournal(database, directory)).toBe(0)

  await runDatabaseMigrations({ connectionString })
  expect(await countObjects(database)).toBe(3)
  expect(await countJournal(database, directory)).toBe(1)

  await database`delete from company_audio_transcription_settings where company_id = ${companyId}`
  await database`delete from occurrence_conversation_attachments where company_id = ${companyId}`
  await database`delete from occurrence_conversation_messages where company_id = ${companyId}`
  await database`delete from occurrence_conversations where company_id = ${companyId}`
  await database`delete from stored_objects where company_id = ${companyId} and purpose = 'occurrence_conversation_attachment'`
}
