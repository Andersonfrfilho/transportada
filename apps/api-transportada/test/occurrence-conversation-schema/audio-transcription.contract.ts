/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.1 (contract.md §5.5): as tabelas da transcrição no schema TypeScript — vocabulário vindo da
 * constante, toda FK ancorada na empresa (tenant-safety: nenhuma amarra anexo, conversa ou empresa por id
 * solto) e os índices que a consulta de 15 s e a rotina do worker usam.
 */
import { describe, expect, test } from 'bun:test'

import {
  companyAudioTranscriptionSettings,
  occurrenceConversationAttachments,
  occurrenceConversationAudioTranscriptions,
} from '../../src/database/database.schema.js'
import {
  CONVERSATION_AUDIO_TRANSCRIPTION_FAILURE_CODES,
  CONVERSATION_AUDIO_TRANSCRIPTION_STATUSES,
} from '../../src/shared/conversation-audio-transcription.constant.js'
import {
  checkSqlByName,
  foreignKeys,
  indexColumnsByName,
  indexWhereSqlByName,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

const TABLE = occurrenceConversationAudioTranscriptions

describe('a transcrição de áudio no schema (spec 264 T2.1)', () => {
  test('status e failure_code são CHECK de lista fechada, sem ENUM', () => {
    const checks = checkSqlByName(TABLE)
    for (const status of CONVERSATION_AUDIO_TRANSCRIPTION_STATUSES) {
      expect(checks.occurrence_conversation_audio_transcriptions_status_check).toContain(
        `'${status}'`,
      )
    }
    for (const code of CONVERSATION_AUDIO_TRANSCRIPTION_FAILURE_CODES) {
      expect(checks.occurrence_conversation_audio_transcriptions_failure_code_check).toContain(
        `'${code}'`,
      )
    }
    expect(CONVERSATION_AUDIO_TRANSCRIPTION_STATUSES).not.toContain('disabled')
    expect(CONVERSATION_AUDIO_TRANSCRIPTION_FAILURE_CODES).toContain('company_disabled')
  })

  test('toda FK é composta com a empresa; a única de empresa sozinha é a âncora restrict', () => {
    const keys = foreignKeys(TABLE)

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
        foreignColumns: ['company_id', 'id'],
        foreignTable: 'occurrence_conversation_attachments',
        onDelete: 'restrict',
      }),
    )
    expect(keys).toContainEqual(
      expect.objectContaining({
        columns: ['company_id', 'conversation_id'],
        foreignColumns: ['company_id', 'id'],
        foreignTable: 'occurrence_conversations',
        onDelete: 'restrict',
      }),
    )
    for (const key of keys) expect(key.columns[0]).toBe('company_id')
    expect(keys).toHaveLength(3)
    expect(requiredColumnNames(TABLE)).toEqual(
      expect.arrayContaining(['company_id', 'attachment_id', 'conversation_id', 'status']),
    )
  })

  test('uma linha por anexo, e os índices servem a consulta do app e a rotina', () => {
    expect(uniqueColumnsByName(TABLE)).toMatchObject({
      occurrence_conversation_audio_transcriptions_attachment_unique: [
        'company_id',
        'attachment_id',
      ],
    })
    expect(indexColumnsByName(TABLE)).toMatchObject({
      occurrence_conversation_audio_transcriptions_conv_updated_idx: [
        'company_id',
        'conversation_id',
        'updated_at',
      ],
      occurrence_conversation_audio_transcriptions_pending_idx: ['next_attempt_at'],
    })
    expect(
      indexWhereSqlByName(TABLE).occurrence_conversation_audio_transcriptions_pending_idx,
    ).toContain(`'pending'`)
    expect(
      indexWhereSqlByName(occurrenceConversationAttachments)
        .occurrence_conversation_attachments_audio_created_idx,
    ).toContain(`like 'audio/%'`)
  })

  test('a configuração tem a empresa por chave, restrict, e o rastro de quem decidiu é nulo', () => {
    expect(foreignKeys(companyAudioTranscriptionSettings)).toContainEqual(
      expect.objectContaining({
        columns: ['company_id'],
        foreignTable: 'companies',
        onDelete: 'restrict',
      }),
    )
    expect(requiredColumnNames(companyAudioTranscriptionSettings)).not.toContain(
      'updated_by_user_id',
    )
    expect(requiredColumnNames(companyAudioTranscriptionSettings)).not.toContain(
      'routine_started_at',
    )
    expect(requiredColumnNames(companyAudioTranscriptionSettings)).toContain('enabled_since')
  })
})
