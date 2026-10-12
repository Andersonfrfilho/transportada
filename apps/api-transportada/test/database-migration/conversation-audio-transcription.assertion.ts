/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.1 (contract.md §5.5): os CHECKs e as chaves da transcrição recusam, no banco, o que a §5.5 recusa.
 * Cada caso roda numa transação que sempre volta: a conversa de viagem e o anexo de áudio são semeados só para
 * o caso, e nada sobra para a cadeia de rollbacks que vem depois.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { AUDIO_TRANSCRIPTION_FAILURE_CODES } from '../../src/shared/conversation-audio-transcription.constant.js'
import { expectQueryToFail } from './support.js'

const CHECK_VIOLATION = '23514'
const UNIQUE_VIOLATION = '23505'
const FOREIGN_KEY_VIOLATION = '23503'
const TABLE_PREFIX = 'occurrence_conversation_audio_transcriptions'
const ZERO_SHA256 = '0'.repeat(64)
const TOO_LONG_MAX_DURATION_MS = 600_000

export type ConversationAudioTranscriptionProbe = Readonly<{
  companyId: string
  connectionString: string
  database: SQL
  directories: readonly string[]
  tripId: string
  userId: string
}>

type Seed = Readonly<{ attachmentId: string; conversationId: string }>

type TranscriptionRow = Readonly<{
  companyId?: string
  failureCode?: string | null
  generatedAt?: Date | null
  maxDurationMs?: number | null
  status?: string
  text?: string | null
}>

class CaseRolledBack extends Error {}

async function runCaseRolledBack(
  database: SQL,
  scenario: (transaction: SQL) => Promise<void>,
): Promise<void> {
  try {
    await database.begin(async (transaction) => {
      await scenario(transaction)
      throw new CaseRolledBack('rollback do caso')
    })
  } catch (error) {
    if (!(error instanceof CaseRolledBack)) throw error
  }
}

async function seedAudioAttachment(
  transaction: SQL,
  probe: ConversationAudioTranscriptionProbe,
): Promise<Seed> {
  const [stored] = await transaction`
    insert into stored_objects (company_id, provider, bucket, object_key, mime_type, size_bytes, sha256, status, purpose)
    values (${probe.companyId}, 's3', 'operational', ${`audio-transcription/${crypto.randomUUID()}.ogg`},
      'audio/ogg', 1024, ${ZERO_SHA256}, 'final', 'trip_occurrence_attachment')
    returning id
  `
  const [conversation] = await transaction`
    insert into occurrence_conversations (company_id, subject_type, trip_id, participant, driver_user_id)
    values (${probe.companyId}, 'trip', ${probe.tripId}, 'driver', ${probe.userId})
    returning id
  `
  const [message] = await transaction`
    insert into occurrence_conversation_messages
      (company_id, conversation_id, channel, direction, author_user_id, status)
    values (${probe.companyId}, ${conversation.id}, 'app', 'outbound', ${probe.userId}, 'queued')
    returning id
  `
  const [attachment] = await transaction`
    insert into occurrence_conversation_attachments
      (company_id, message_id, stored_object_id, sha256, size_bytes, content_type)
    values (${probe.companyId}, ${message.id}, ${stored.id}, ${ZERO_SHA256}, 1024, 'audio/ogg')
    returning id
  `
  return { attachmentId: attachment.id, conversationId: conversation.id }
}

async function insertTranscription(
  transaction: SQL,
  probe: ConversationAudioTranscriptionProbe,
  seed: Seed,
  row: TranscriptionRow,
): Promise<void> {
  await transaction`
    insert into occurrence_conversation_audio_transcriptions
      (company_id, attachment_id, conversation_id, status, text, failure_code, max_duration_ms, generated_at)
    values (${row.companyId ?? probe.companyId}, ${seed.attachmentId}, ${seed.conversationId},
      ${row.status ?? 'pending'}, ${row.text ?? null}, ${row.failureCode ?? null},
      ${row.maxDurationMs ?? null}, ${row.generatedAt ?? null})
  `
}

async function expectTranscriptionRefused(
  probe: ConversationAudioTranscriptionProbe,
  row: TranscriptionRow,
  constraint: string,
): Promise<void> {
  await runCaseRolledBack(probe.database, async (transaction) => {
    const seed = await seedAudioAttachment(transaction, probe)
    await expectQueryToFail(
      insertTranscription(transaction, probe, seed, row),
      CHECK_VIOLATION,
      constraint,
    )
  })
}

async function expectTranscriptionAccepted(
  probe: ConversationAudioTranscriptionProbe,
  row: TranscriptionRow,
): Promise<void> {
  await runCaseRolledBack(probe.database, async (transaction) => {
    const seed = await seedAudioAttachment(transaction, probe)
    await insertTranscription(transaction, probe, seed, row)
  })
}

async function assertOneTranscriptionPerAttachment(probe: ConversationAudioTranscriptionProbe) {
  await runCaseRolledBack(probe.database, async (transaction) => {
    const seed = await seedAudioAttachment(transaction, probe)
    await insertTranscription(transaction, probe, seed, { status: 'pending' })
    await expectQueryToFail(
      insertTranscription(transaction, probe, seed, { status: 'pending' }),
      UNIQUE_VIOLATION,
      `${TABLE_PREFIX}_attachment_unique`,
    )
  })
}

async function assertCompanyIsTheAnchor(probe: ConversationAudioTranscriptionProbe) {
  await runCaseRolledBack(probe.database, async (transaction) => {
    const seed = await seedAudioAttachment(transaction, probe)
    await expectQueryToFail(
      insertTranscription(transaction, probe, seed, { companyId: crypto.randomUUID() }),
      FOREIGN_KEY_VIOLATION,
    )
  })
}

async function assertTextLimitIsCodePoints(probe: ConversationAudioTranscriptionProbe) {
  const limitText = 'a'.repeat(20_000)
  const emojiLimitText = '😀'.repeat(20_000)
  await expectTranscriptionAccepted(probe, {
    status: 'ready',
    text: limitText,
    generatedAt: new Date(),
  })
  await expectTranscriptionAccepted(probe, {
    status: 'ready',
    text: emojiLimitText,
    generatedAt: new Date(),
  })
  await expectTranscriptionRefused(
    probe,
    { status: 'ready', text: `${limitText}a`, generatedAt: new Date() },
    `${TABLE_PREFIX}_text_length_check`,
  )
  await expectTranscriptionRefused(
    probe,
    { status: 'ready', text: `${emojiLimitText}😀`, generatedAt: new Date() },
    `${TABLE_PREFIX}_text_length_check`,
  )
}

async function assertStatusIsClosedList(probe: ConversationAudioTranscriptionProbe) {
  for (const status of ['disabled', 'purged']) {
    await expectTranscriptionRefused(probe, { status }, `${TABLE_PREFIX}_status_check`)
  }
}

async function assertFailureCodesAreClosedList(probe: ConversationAudioTranscriptionProbe) {
  await expectTranscriptionRefused(
    probe,
    { status: 'failed', failureCode: 'bogus_code' },
    `${TABLE_PREFIX}_failure_check`,
  )
  for (const failureCode of AUDIO_TRANSCRIPTION_FAILURE_CODES) {
    const maxDurationMs = failureCode === 'too_long' ? TOO_LONG_MAX_DURATION_MS : null
    await expectTranscriptionAccepted(probe, { status: 'failed', failureCode, maxDurationMs })
  }
}

async function assertStatusAndFailureShape(probe: ConversationAudioTranscriptionProbe) {
  await expectTranscriptionRefused(probe, { status: 'failed' }, `${TABLE_PREFIX}_failed_code_check`)
  await expectTranscriptionRefused(
    probe,
    { status: 'ready', text: 'texto' },
    `${TABLE_PREFIX}_ready_gen_check`,
  )
  await expectTranscriptionRefused(
    probe,
    { status: 'pending', generatedAt: new Date() },
    `${TABLE_PREFIX}_ready_gen_check`,
  )
  await expectTranscriptionAccepted(probe, { status: 'ready', text: null, generatedAt: new Date() })
}

async function assertTooLongCarriesItsCap(probe: ConversationAudioTranscriptionProbe) {
  await expectTranscriptionRefused(
    probe,
    { status: 'failed', failureCode: 'too_long' },
    `${TABLE_PREFIX}_too_long_check`,
  )
  await expectTranscriptionRefused(
    probe,
    { status: 'failed', failureCode: 'engine_failed', maxDurationMs: TOO_LONG_MAX_DURATION_MS },
    `${TABLE_PREFIX}_too_long_check`,
  )
}

async function assertCompanySettings(probe: ConversationAudioTranscriptionProbe) {
  await runCaseRolledBack(probe.database, async (transaction) => {
    const [settings] = await transaction`
      insert into company_audio_transcription_settings (company_id, updated_by_user_id)
      values (${probe.companyId}, ${probe.userId})
      returning enabled, routine_started_at
    `
    expect(settings?.enabled).toBe(true)
    expect(settings?.routine_started_at).toBeNull()
    await expectQueryToFail(
      transaction`
        insert into company_audio_transcription_settings (company_id) values (${probe.companyId})
      `,
      UNIQUE_VIOLATION,
    )
  })
}

export async function assertConversationAudioTranscription(
  probe: ConversationAudioTranscriptionProbe,
): Promise<void> {
  await assertOneTranscriptionPerAttachment(probe)
  await assertCompanyIsTheAnchor(probe)
  await assertTextLimitIsCodePoints(probe)
  await assertStatusIsClosedList(probe)
  await assertFailureCodesAreClosedList(probe)
  await assertStatusAndFailureShape(probe)
  await assertTooLongCarriesItsCap(probe)
  await assertCompanySettings(probe)
}
