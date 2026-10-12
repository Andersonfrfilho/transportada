/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.1: a cópia por valor das duas tabelas da transcrição de áudio no worker acompanha a API — coluna a
 * coluna, vocabulário de `status`/`failure_code` (inclusive o CHECK da migration) e o teto do texto.
 */
import { readdir, readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  CONVERSATION_AUDIO_TRANSCRIPTION_FAILURE_CODES,
  CONVERSATION_AUDIO_TRANSCRIPTION_STATUSES,
  CONVERSATION_AUDIO_TRANSCRIPTION_TEXT_MAX_LENGTH,
  companyAudioTranscriptionSettings,
  occurrenceConversationAudioTranscriptions,
} from '../../src/database/conversation-audio-transcription.schema.js'

const WORKER = new URL(
  '../../src/database/conversation-audio-transcription.schema.ts',
  import.meta.url,
)
const API_SCHEMA = new URL(
  '../../../api-transportada/src/database/conversation-audio-transcription.schema.ts',
  import.meta.url,
)
const API_CONSTANT = new URL(
  '../../../api-transportada/src/shared/conversation-audio-transcription.constant.ts',
  import.meta.url,
)
const API_MIGRATIONS = new URL('../../../api-transportada/drizzle/', import.meta.url)

/** Espaço e vírgula final não são parte da coluna: o prettier de cada app quebra a linha onde quiser. */
function normalize(source: string): string {
  return source
    .replaceAll(/\.\$type<[^>]*>\(\)/gu, '')
    .replaceAll(/\s+/gu, ' ')
    .replaceAll(/,\s*([)}])/gu, ' $1')
    .replaceAll(/\{\s+/gu, '{ ')
    .replaceAll(/\s+\}/gu, ' }')
}

function tableBlock(source: string, tableName: string): string {
  const from = source.search(new RegExp(`pgTable\\(\\s*'${tableName}'`, 'u'))
  expect(from).toBeGreaterThanOrEqual(0)
  const next = source.indexOf('\nexport const', from)
  return source.slice(from, next < 0 ? undefined : next)
}

const COLUMN_START = /(\w+: (?:uuid|text|varchar|integer|smallint|timestamp|boolean)\()/u

function workerColumns(workerBlock: string): string[] {
  const normalized = normalize(workerBlock)
  const first = normalized.search(COLUMN_START)
  expect(first).toBeGreaterThanOrEqual(0)
  return normalized
    .slice(first)
    .split(/,\s(?=\w+: (?:uuid|text|varchar|integer|smallint|timestamp|boolean)\()/u)
    .map((column) => column.replace(/\s*\}(?:\s*\))?\s*$/u, '').trim())
}

function asStrings(values: readonly string[]): string[] {
  return [...values]
}

function quotedValues(source: string): string[] {
  return [...source.matchAll(/'([a-z0-9_]+)'/gu)].map((match) => match[1] ?? '')
}

describe('conversation audio transcription mirror parity (spec 264 T3.1)', () => {
  test.each([
    ['occurrence_conversation_audio_transcriptions', 20],
    ['company_audio_transcription_settings', 6],
  ] as const)('%s: cada coluna da cópia está igual na API', async (tableName, expectedColumns) => {
    const [worker, api] = await Promise.all([
      readFile(WORKER, 'utf8'),
      readFile(API_SCHEMA, 'utf8'),
    ])
    const columns = workerColumns(tableBlock(worker, tableName))
    const apiBlock = normalize(tableBlock(api, tableName))

    expect(columns).toHaveLength(expectedColumns)
    for (const column of columns) {
      expect({ column, inApi: apiBlock.includes(column) }).toEqual({ column, inApi: true })
    }
  })

  test('as tabelas e as colunas apontam para o que a API migra, na mesma ordem', () => {
    const transcriptions = getTableConfig(occurrenceConversationAudioTranscriptions)
    const settings = getTableConfig(companyAudioTranscriptionSettings)

    expect(transcriptions.name).toBe('occurrence_conversation_audio_transcriptions')
    expect(transcriptions.columns.map((column) => column.name)).toEqual([
      'id',
      'company_id',
      'attachment_id',
      'conversation_id',
      'status',
      'text',
      'language',
      'audio_duration_ms',
      'engine',
      'model',
      'processing_ms',
      'attempts',
      'lease_token',
      'lease_expires_at',
      'max_duration_ms',
      'next_attempt_at',
      'failure_code',
      'generated_at',
      'created_at',
      'updated_at',
    ])
    expect(settings.name).toBe('company_audio_transcription_settings')
    expect(settings.columns.map((column) => column.name)).toEqual([
      'company_id',
      'enabled',
      'enabled_since',
      'routine_started_at',
      'updated_by_user_id',
      'updated_at',
    ])
  })

  test('status, failure_code e teto do texto são os mesmos da API e do CHECK da migration', async () => {
    const [constant, directories] = await Promise.all([
      readFile(API_CONSTANT, 'utf8'),
      readdir(API_MIGRATIONS),
    ])
    const migrationDirectory = directories.find((name) =>
      name.endsWith('_conversation_audio_transcription'),
    )
    expect(migrationDirectory).toBeDefined()
    const migration = await readFile(
      new URL(`${migrationDirectory ?? ''}/migration.sql`, API_MIGRATIONS),
      'utf8',
    )

    const statusObject = constant.slice(
      constant.indexOf('CONVERSATION_AUDIO_TRANSCRIPTION_STATUS = {'),
      constant.indexOf('} as const'),
    )
    expect(asStrings(CONVERSATION_AUDIO_TRANSCRIPTION_STATUSES).toSorted()).toEqual(
      quotedValues(statusObject).toSorted(),
    )
    const codesStart = constant.indexOf('CONVERSATION_AUDIO_TRANSCRIPTION_FAILURE_CODES = [')
    const codesBlock = constant.slice(codesStart, constant.indexOf('] as const', codesStart))
    expect(asStrings(CONVERSATION_AUDIO_TRANSCRIPTION_FAILURE_CODES)).toEqual(
      quotedValues(codesBlock),
    )

    const list = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ')
    expect(migration).toContain(`"status" in (${list(CONVERSATION_AUDIO_TRANSCRIPTION_STATUSES)})`)
    expect(migration).toContain(
      `"failure_code" in (${list(CONVERSATION_AUDIO_TRANSCRIPTION_FAILURE_CODES)})`,
    )

    expect(constant).toContain(
      `CONVERSATION_AUDIO_TRANSCRIPTION_TEXT_MAX_LENGTH = ${CONVERSATION_AUDIO_TRANSCRIPTION_TEXT_MAX_LENGTH.toLocaleString('en-US').replaceAll(',', '_')}`,
    )
    expect(migration).toContain(
      `char_length("text") <= ${CONVERSATION_AUDIO_TRANSCRIPTION_TEXT_MAX_LENGTH}`,
    )
  })
})
