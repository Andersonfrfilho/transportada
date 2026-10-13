/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { companyAudioTranscriptionSettings } from '../../src/database/company-audio-transcription-settings.schema.js'
import { occurrenceConversationAudioTranscriptions } from '../../src/database/occurrence-conversation-audio-transcription.schema.js'
import { AUDIO_TRANSCRIPTION_STATUSES } from '../../src/shared/conversation-audio-transcription.constant.js'

const COLUMN_LINE = /^\s+[a-zA-Z]+: (uuid|text|varchar|integer|smallint|boolean|timestamp)\(.*,$/u

const TRANSCRIPTION_MIRROR = {
  worker: new URL(
    '../../src/database/occurrence-conversation-audio-transcription.schema.ts',
    import.meta.url,
  ),
  api: new URL(
    '../../../api-transportada/src/database/occurrence-conversation-audio-transcription.schema.ts',
    import.meta.url,
  ),
  tableName: 'occurrence_conversation_audio_transcriptions',
  columnCount: 20,
}

const SETTINGS_MIRROR = {
  worker: new URL(
    '../../src/database/company-audio-transcription-settings.schema.ts',
    import.meta.url,
  ),
  api: new URL(
    '../../../api-transportada/src/database/company-audio-transcription-settings.schema.ts',
    import.meta.url,
  ),
  tableName: 'company_audio_transcription_settings',
  columnCount: 6,
}

const CONSTANT_MIRROR = {
  worker: new URL('../../src/shared/conversation-audio-transcription.constant.ts', import.meta.url),
  api: new URL(
    '../../../api-transportada/src/shared/conversation-audio-transcription.constant.ts',
    import.meta.url,
  ),
}

function extractColumnLines(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => COLUMN_LINE.test(line))
    .map((line) => line.trim())
}

/** Compara o código: sem comentários e sem diferença de espaço ou quebra de linha. */
function extractCode(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

/**
 * ⚠️ **Cópia por valor.** O worker escreve nestas tabelas a partir da própria cópia; uma coluna ou constante
 * que muda na API e não aqui é `INSERT`/`UPDATE` que falha em produção ou grava um código que a API recusa.
 */
describe('conversation audio transcription mirror parity (spec 264 T3.1)', () => {
  for (const mirror of [TRANSCRIPTION_MIRROR, SETTINGS_MIRROR]) {
    test(`${mirror.tableName}: cada coluna da cópia lê exatamente como na API`, async () => {
      const [worker, api] = await Promise.all([
        readFile(mirror.worker, 'utf8'),
        readFile(mirror.api, 'utf8'),
      ])

      const workerColumns = extractColumnLines(worker)

      expect(workerColumns).toHaveLength(mirror.columnCount)
      expect(workerColumns).toEqual(extractColumnLines(api))
    })
  }

  test('aponta para as tabelas que a API migra, com as colunas que o worker grava', () => {
    const transcriptionNames = getTableConfig(
      occurrenceConversationAudioTranscriptions,
    ).columns.map((column) => column.name)
    const settingsNames = getTableConfig(companyAudioTranscriptionSettings).columns.map(
      (column) => column.name,
    )

    expect(getTableConfig(occurrenceConversationAudioTranscriptions).name).toBe(
      TRANSCRIPTION_MIRROR.tableName,
    )
    expect(getTableConfig(companyAudioTranscriptionSettings).name).toBe(SETTINGS_MIRROR.tableName)
    for (const written of [
      'status',
      'text',
      'lease_token',
      'failure_code',
      'generated_at',
      'max_duration_ms',
    ]) {
      expect(transcriptionNames).toContain(written)
    }
    for (const read of ['enabled', 'enabled_since', 'routine_started_at']) {
      expect(settingsNames).toContain(read)
    }
  })

  test('as constantes da cópia são as da API, código a código (status, códigos, limites)', async () => {
    const [worker, api] = await Promise.all([
      readFile(CONSTANT_MIRROR.worker, 'utf8'),
      readFile(CONSTANT_MIRROR.api, 'utf8'),
    ])

    expect(extractCode(worker)).toBe(extractCode(api))
    expect(AUDIO_TRANSCRIPTION_STATUSES).toEqual(['pending', 'ready', 'failed'])
  })
})
