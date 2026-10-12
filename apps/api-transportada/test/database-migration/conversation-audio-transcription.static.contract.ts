/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.1: a migration da transcrição de áudio é só aditiva (duas tabelas e índices; nenhum UPDATE,
 * DELETE nem DROP), sem ENUM nativo, com os CHECKs do contrato §5.5 e o vocabulário vindo da constante; o
 * rollback derruba só o que criou, na ordem certa, e fecha o journal contado.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
  CONVERSATION_AUDIO_TRANSCRIPTION_FAILURE_CODES,
  CONVERSATION_AUDIO_TRANSCRIPTION_STATUSES,
  CONVERSATION_AUDIO_TRANSCRIPTION_TEXT_MAX_LENGTH,
} from '../../src/shared/conversation-audio-transcription.constant.js'
import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_conversation_audio_transcription'

async function readMigration(file: string): Promise<{ directory: string; text: string }> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('conversation_audio_transcription is required')
  const text = await Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
  return { directory, text }
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--(?!>).*$/gmu, '')
}

function positionOf(sqlText: string, fragment: string): number {
  const position = sqlText.indexOf(fragment)
  if (position < 0) throw new Error(`Missing fragment: ${fragment}`)
  return position
}

const list = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ')

describe('a transcrição de áudio da conversa entra aditiva (spec 264 T2.1)', () => {
  test('só cria: sem UPDATE, DELETE nem DROP, sem ENUM nativo', async () => {
    const instructions = withoutComments((await readMigration('migration.sql')).text)

    expect(instructions.match(/\bCREATE TABLE\b/gu)).toHaveLength(2)
    expect(instructions).not.toMatch(
      /\bUPDATE "|\bDELETE FROM\b|\bDROP (?:TABLE|COLUMN|CONSTRAINT|INDEX)\b|\bCREATE TYPE\b|\bADD COLUMN\b|\bALTER COLUMN\b/u,
    )
  })

  test('os CHECKs levam o vocabulário da constante, o teto de texto e o par too_long/teto', async () => {
    const instructions = withoutComments((await readMigration('migration.sql')).text)

    expect(instructions).toContain(
      `CHECK ("status" in (${list(CONVERSATION_AUDIO_TRANSCRIPTION_STATUSES)}))`,
    )
    expect(instructions).toContain(
      `CHECK ("failure_code" is null or "failure_code" in (${list(CONVERSATION_AUDIO_TRANSCRIPTION_FAILURE_CODES)}))`,
    )
    for (const code of [
      'too_long',
      'attempts_exhausted',
      'sha256_mismatch',
      'object_missing',
      'engine_timeout',
      'company_disabled',
    ] as const) {
      expect(CONVERSATION_AUDIO_TRANSCRIPTION_FAILURE_CODES).toContain(code)
    }
    expect(instructions).toContain(
      `CHECK ("text" is null or char_length("text") <= ${CONVERSATION_AUDIO_TRANSCRIPTION_TEXT_MAX_LENGTH})`,
    )
    expect(instructions).toContain(
      `CHECK ((coalesce("failure_code", '') = 'too_long') = ("max_duration_ms" is not null))`,
    )
    expect(instructions).toContain(`CHECK (("status" = 'ready') = ("generated_at" is not null))`)
    expect(instructions).toContain(`CHECK ("status" <> 'failed' or "failure_code" is not null)`)
  })

  test('as FKs compostas levam a empresa; únicos e índices são os do contrato', async () => {
    const instructions = withoutComments((await readMigration('migration.sql')).text)

    expect(instructions).toContain(
      'FOREIGN KEY ("company_id","attachment_id") REFERENCES "occurrence_conversation_attachments"("company_id","id")',
    )
    expect(instructions).toContain(
      'FOREIGN KEY ("company_id","conversation_id") REFERENCES "occurrence_conversations"("company_id","id")',
    )
    expect(instructions).toContain('UNIQUE("company_id","attachment_id")')
    expect(instructions).toContain(
      '"occurrence_conversation_audio_transcriptions" ("company_id","conversation_id","updated_at")',
    )
    expect(instructions).toContain(
      `"occurrence_conversation_audio_transcriptions" ("next_attempt_at") WHERE "status" = 'pending'`,
    )
    expect(instructions).toContain(
      `"occurrence_conversation_attachments" ("created_at") WHERE "content_type" like 'audio/%'`,
    )
  })

  test('o rollback derruba o índice e as tabelas, sem CASCADE, e fecha o journal contado', async () => {
    const { directory, text } = await readMigration('rollback.sql')
    const order = [
      'BEGIN;',
      "SET LOCAL lock_timeout = '3s';",
      'DROP INDEX IF EXISTS "occurrence_conversation_attachments_audio_created_idx"',
      'DROP TABLE IF EXISTS "occurrence_conversation_audio_transcriptions"',
      'DROP TABLE IF EXISTS "company_audio_transcription_settings"',
      `WHERE "name" = '${directory}'`,
      'ROW_COUNT',
      'COMMIT;',
    ].map((fragment) => positionOf(text, fragment))

    expect(order).toEqual(order.toSorted((left, right) => left - right))
    expect(withoutComments(text)).not.toMatch(/\bCASCADE\b/u)
    expect(text.trimEnd()).toEndWith('COMMIT;')
  })
})
