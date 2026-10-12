/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.1 (contract.md §5.5): a migration da transcrição do áudio entra só aditiva — sem UPDATE, DELETE
 * nem DROP fora do rollback —, sem ENUM nativo, com um único índice novo em anexos (parcial, só áudio), com
 * todo identificador dentro dos 63 bytes do Postgres, e o rollback derruba as tabelas e tira a linha do
 * journal com guarda de `ROW_COUNT`.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_conversation_audio_transcription'
const LAST_STAGING_MIGRATION = '20261010103500_quick_reply_driver_audience'
const POSTGRES_IDENTIFIER_MAX_BYTES = 63

async function readMigration(file: string): Promise<{ directory: string; text: string }> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error(`${MIGRATION_SUFFIX} migration is required`)
  const text = await Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
  return { directory, text }
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--(?!>).*$/gmu, '')
}

describe('a migration da transcrição entra aditiva (spec 264 T2.1)', () => {
  test('a pasta é posterior à última migração de staging e tem o sufixo da spec', async () => {
    const { directory } = await readMigration('migration.sql')

    expect(directory > LAST_STAGING_MIGRATION).toBe(true)
    expect(directory.endsWith(MIGRATION_SUFFIX)).toBe(true)
  })

  test('sem UPDATE, DELETE, DROP nem ENUM nativo; cria as duas tabelas', async () => {
    const { text } = await readMigration('migration.sql')
    const instructions = withoutComments(text)

    expect(instructions).not.toMatch(
      /\bUPDATE "|\bDELETE FROM\b|\bDROP (?:TABLE|COLUMN|CONSTRAINT|INDEX)\b/u,
    )
    expect(instructions).not.toMatch(/\bCREATE TYPE\b/u)
    expect(instructions).toContain('CREATE TABLE "occurrence_conversation_audio_transcriptions"')
    expect(instructions).toContain('CREATE TABLE "company_audio_transcription_settings"')
  })

  test('o único índice novo em anexos é o parcial de áudio sobre created_at', async () => {
    const { text } = await readMigration('migration.sql')
    const instructions = withoutComments(text)
    const attachmentIndexes = instructions
      .split('\n')
      .filter(
        (line) =>
          /CREATE (?:UNIQUE )?INDEX/u.test(line) &&
          line.includes('"occurrence_conversation_attachments"'),
      )

    expect(attachmentIndexes).toHaveLength(1)
    expect(attachmentIndexes[0]).toContain('occurrence_conversation_attachments_audio_created_idx')
    expect(attachmentIndexes[0]).toContain('"created_at"')
    expect(attachmentIndexes[0]).toContain("'audio/%'")
    expect(attachmentIndexes[0]).toContain('WHERE')
  })

  test('todo identificador entre aspas cabe nos 63 bytes do Postgres', async () => {
    const { text } = await readMigration('migration.sql')
    const identifiers = [...withoutComments(text).matchAll(/"([^"]+)"/gu)].map(
      (match) => match[1] ?? '',
    )

    expect(identifiers.length).toBeGreaterThan(0)
    for (const identifier of identifiers) {
      expect(new TextEncoder().encode(identifier).length, identifier).toBeLessThanOrEqual(
        POSTGRES_IDENTIFIER_MAX_BYTES,
      )
    }
  })

  test('o rollback derruba índice e tabelas, não tem CASCADE, e tira a linha do journal com guarda', async () => {
    const { directory, text } = await readMigration('rollback.sql')
    const instructions = withoutComments(text)
    const order = [
      'BEGIN;',
      'DROP INDEX IF EXISTS "occurrence_conversation_attachments_audio_created_idx"',
      'DROP TABLE IF EXISTS "occurrence_conversation_audio_transcriptions"',
      'DROP TABLE IF EXISTS "company_audio_transcription_settings"',
      `WHERE "name" = '${directory}'`,
      'ROW_COUNT',
      'COMMIT;',
    ].map((fragment) => {
      const position = text.indexOf(fragment)
      if (position < 0) throw new Error(`Missing fragment: ${fragment}`)
      return position
    })

    expect(order).toEqual(order.toSorted((left, right) => left - right))
    expect(instructions).not.toMatch(/\bCASCADE\b|\bUPDATE\b|\bDELETE FROM "occurrence_/u)
    expect(text.trimEnd()).toEndWith('COMMIT;')
  })
})
