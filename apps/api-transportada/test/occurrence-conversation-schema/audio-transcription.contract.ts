/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.1 (contract.md §5.5, plan.md § c): as tabelas da transcrição do áudio e da configuração por
 * empresa. Toda FK leva `company_id`; o texto cabe em 20 000 caracteres por CHECK; a falha é lista fechada
 * e `disabled` nunca é gravado (é derivado da configuração).
 */
import { describe, expect, test } from 'bun:test'

import {
  companyAudioTranscriptionSettings,
  occurrenceConversationAttachments,
  occurrenceConversationAudioTranscriptions,
} from '../../src/database/database.schema.js'
import {
  AUDIO_TRANSCRIPTION_FAILURE_CODES,
  AUDIO_TRANSCRIPTION_STATUSES,
  AUDIO_TRANSCRIPTION_TEXT_MAX_CHARACTERS,
} from '../../src/shared/conversation-audio-transcription.constant.js'
import {
  checkSqlByName,
  columnNames,
  foreignKeys,
  indexColumnsByName,
  indexWhereSqlByName,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

const POSTGRES_IDENTIFIER_MAX_BYTES = 63
const AUDIO_INDEX = 'occurrence_conversation_attachments_audio_created_idx'

/** As CHECKs saem qualificadas pelo nome da tabela; a comparação é pela forma da regra. */
function transcriptionChecks(): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(checkSqlByName(occurrenceConversationAudioTranscriptions)).map(
      ([name, sqlText]) => [
        name,
        sqlText.replaceAll('"occurrence_conversation_audio_transcriptions".', ''),
      ],
    ),
  )
}

function identifierBytes(name: string): number {
  return new TextEncoder().encode(name).length
}

describe('a transcrição do áudio no schema (spec 264 T2.1)', () => {
  test('a transcrição ancora na empresa e nas duas chaves compostas do anexo e da conversa', () => {
    const keys = foreignKeys(occurrenceConversationAudioTranscriptions)

    expect(keys).toContainEqual(
      expect.objectContaining({
        columns: ['company_id'],
        foreignTable: 'companies',
        onDelete: 'restrict',
      }),
    )
    expect(keys).toContainEqual(
      expect.objectContaining({
        columns: ['company_id', 'attachment_id'],
        foreignTable: 'occurrence_conversation_attachments',
        onDelete: 'restrict',
      }),
    )
    expect(keys).toContainEqual(
      expect.objectContaining({
        columns: ['company_id', 'conversation_id'],
        foreignTable: 'occurrence_conversations',
        onDelete: 'restrict',
      }),
    )
  })

  test('toda FK das tabelas novas leva company_id (tenant-safety)', () => {
    for (const table of [
      occurrenceConversationAudioTranscriptions,
      companyAudioTranscriptionSettings,
    ]) {
      for (const key of foreignKeys(table)) expect(key.columns).toContain('company_id')
    }
  })

  test('uma transcrição por anexo e empresa, e o lookup da leitura cobre a conversa e o tempo', () => {
    expect(uniqueColumnsByName(occurrenceConversationAudioTranscriptions)).toEqual({
      occurrence_conversation_audio_transcriptions_attachment_unique: [
        'company_id',
        'attachment_id',
      ],
    })
    expect(indexColumnsByName(occurrenceConversationAudioTranscriptions)).toEqual({
      occurrence_conversation_audio_transcriptions_conversation_idx: [
        'company_id',
        'conversation_id',
        'updated_at',
      ],
      occurrence_conversation_audio_transcriptions_claim_idx: ['next_attempt_at'],
    })
    expect(
      indexWhereSqlByName(occurrenceConversationAudioTranscriptions)
        .occurrence_conversation_audio_transcriptions_claim_idx,
    ).toContain("'pending'")
  })

  test('as colunas da §5.5 existem e as obrigatórias são as que a rotina não deixa nulas', () => {
    expect(columnNames(occurrenceConversationAudioTranscriptions)).toEqual(
      expect.arrayContaining([
        'conversation_id',
        'lease_token',
        'lease_expires_at',
        'max_duration_ms',
        'failure_code',
        'attempts',
        'next_attempt_at',
        'language',
        'engine',
        'model',
        'processing_ms',
        'generated_at',
        'updated_at',
      ]),
    )
    const required = requiredColumnNames(occurrenceConversationAudioTranscriptions)
    expect(required).toEqual(
      expect.arrayContaining([
        'company_id',
        'attachment_id',
        'conversation_id',
        'status',
        'attempts',
      ]),
    )
    for (const nullable of [
      'lease_token',
      'max_duration_ms',
      'failure_code',
      'text',
      'generated_at',
    ]) {
      expect(required).not.toContain(nullable)
    }
  })

  test('o status é lista fechada sem disabled nem purged: disabled é derivado, purged é ready sem texto', () => {
    expect([...AUDIO_TRANSCRIPTION_STATUSES]).toEqual(['pending', 'ready', 'failed'])
    const checks = transcriptionChecks()
    expect(checks.occurrence_conversation_audio_transcriptions_status_check).toContain(
      "'pending', 'ready', 'failed'",
    )
    expect(checks.occurrence_conversation_audio_transcriptions_status_check).not.toContain(
      'disabled',
    )
    expect(checks.occurrence_conversation_audio_transcriptions_status_check).not.toContain('purged')
  })

  test('o código de falha é lista fechada da RF14 mais company_disabled', () => {
    const codes: readonly string[] = AUDIO_TRANSCRIPTION_FAILURE_CODES
    expect([...codes].toSorted()).toEqual(
      [
        'attempts_exhausted',
        'company_disabled',
        'empty_audio',
        'engine_failed',
        'engine_timeout',
        'object_missing',
        'sha256_mismatch',
        'too_long',
        'unsupported_format',
      ].toSorted(),
    )
    const check =
      transcriptionChecks().occurrence_conversation_audio_transcriptions_failure_check ?? ''
    for (const code of AUDIO_TRANSCRIPTION_FAILURE_CODES) expect(check).toContain(`'${code}'`)
  })

  test('o texto cabe em 20 000 caracteres por char_length, e too_long carrega o teto e só ele', () => {
    expect(AUDIO_TRANSCRIPTION_TEXT_MAX_CHARACTERS).toBe(20_000)
    const checks = transcriptionChecks()
    expect(checks.occurrence_conversation_audio_transcriptions_text_length_check).toContain(
      'char_length("text") <= 20000',
    )
    expect(checks.occurrence_conversation_audio_transcriptions_too_long_check).toContain(
      "coalesce(\"failure_code\", '') = 'too_long'",
    )
    expect(checks.occurrence_conversation_audio_transcriptions_too_long_check).toContain(
      '"max_duration_ms" is not null',
    )
  })

  test('o rótulo de falha exige failed e o pronto exige generated_at', () => {
    const checks = transcriptionChecks()
    expect(checks.occurrence_conversation_audio_transcriptions_failed_code_check).toContain(
      '"status" <> \'failed\' or "failure_code" is not null',
    )
    expect(checks.occurrence_conversation_audio_transcriptions_ready_gen_check).toContain(
      '("status" = \'ready\') = ("generated_at" is not null)',
    )
  })

  test('a configuração por empresa tem a forma da §5.5 e a chave é a empresa', () => {
    expect(columnNames(companyAudioTranscriptionSettings)).toEqual([
      'company_id',
      'enabled',
      'enabled_since',
      'routine_started_at',
      'updated_by_user_id',
      'updated_at',
    ])
    expect(requiredColumnNames(companyAudioTranscriptionSettings)).toEqual(
      expect.arrayContaining(['company_id', 'enabled', 'enabled_since', 'updated_at']),
    )
    expect(requiredColumnNames(companyAudioTranscriptionSettings)).not.toContain(
      'routine_started_at',
    )
    expect(foreignKeys(companyAudioTranscriptionSettings)).toContainEqual(
      expect.objectContaining({
        columns: ['company_id'],
        foreignTable: 'companies',
        onDelete: 'restrict',
      }),
    )
  })

  test('o índice parcial de áudio é o único novo em anexos, sobre created_at', () => {
    const where = indexWhereSqlByName(occurrenceConversationAttachments)[AUDIO_INDEX]
    expect(where).toContain('content_type')
    expect(where).toContain("like 'audio/%'")
    expect(indexColumnsByName(occurrenceConversationAttachments)[AUDIO_INDEX]).toEqual([
      'created_at',
    ])
  })

  test('todo nome de constraint e índice das tabelas novas cabe nos 63 bytes do Postgres', () => {
    const names = [
      ...Object.keys(transcriptionChecks()),
      ...Object.keys(checkSqlByName(companyAudioTranscriptionSettings)),
      ...Object.keys(uniqueColumnsByName(occurrenceConversationAudioTranscriptions)),
      ...Object.keys(indexColumnsByName(occurrenceConversationAudioTranscriptions)),
      ...foreignKeys(occurrenceConversationAudioTranscriptions).map((key) => key.name),
      ...foreignKeys(companyAudioTranscriptionSettings).map((key) => key.name),
      AUDIO_INDEX,
    ]
    for (const name of names) {
      expect(identifierBytes(name), name).toBeLessThanOrEqual(POSTGRES_IDENTIFIER_MAX_BYTES)
    }
  })
})
