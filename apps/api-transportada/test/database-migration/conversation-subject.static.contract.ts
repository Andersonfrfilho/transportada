/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.3a (ADR-0101): a migration do assunto da conversa é só aditiva — sem UPDATE, DELETE nem
 * DROP —, o único e o CHECK antigos ficam intactos, e o rollback recusa antes de qualquer DROP e tira a
 * linha do journal com guarda de `ROW_COUNT`.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
  CLIENT_MESSAGE_ID_CHARACTERS_PATTERN,
  CLIENT_MESSAGE_ID_MAX_LENGTH,
  CLIENT_MESSAGE_ID_MIN_LENGTH,
  OCCURRENCE_CONVERSATION_SUBJECT_TYPES,
} from '../../src/shared/occurrence-conversation-subject.constant.js'
import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_conversation_subject'

async function readMigration(file: string): Promise<{ directory: string; text: string }> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('conversation_subject is required')
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

describe('o assunto da conversa entra aditivo (spec 260 T2.3a)', () => {
  test('sem UPDATE, DELETE nem DROP; o padrão do assunto é ocorrência e o vocabulário vem da constante', async () => {
    const { text } = await readMigration('migration.sql')
    const instructions = withoutComments(text)

    expect(instructions).not.toMatch(
      /\bUPDATE "|\bDELETE FROM\b|\bDROP (?:TABLE|COLUMN|CONSTRAINT|INDEX)\b/u,
    )
    expect(instructions).toContain(
      'ADD COLUMN "subject_type" varchar(16) DEFAULT \'occurrence\' NOT NULL',
    )
    const vocabulary = OCCURRENCE_CONVERSATION_SUBJECT_TYPES.map((value) => `'${value}'`).join(', ')
    expect(instructions).toContain(`CHECK ("subject_type" in (${vocabulary}))`)
    expect(instructions).toContain(
      `char_length("client_message_id") between ${CLIENT_MESSAGE_ID_MIN_LENGTH} and ${CLIENT_MESSAGE_ID_MAX_LENGTH} and "client_message_id" ~ '${CLIENT_MESSAGE_ID_CHARACTERS_PATTERN}'`,
    )
    expect(instructions).not.toContain('occurrence_conversations_occurrence_participant_unique')
  })

  test('o CHECK de forma e as FKs compostas levam a empresa; os únicos parciais são de nota e de viagem', async () => {
    const { text } = await readMigration('migration.sql')
    const instructions = withoutComments(text)

    expect(instructions).toContain('CONSTRAINT "occurrence_conversations_subject_shape_check"')
    expect(instructions).toContain(
      'FOREIGN KEY ("company_id","trip_id") REFERENCES "trips"("company_id","id")',
    )
    expect(instructions).toContain(
      'FOREIGN KEY ("company_id","trip_document_id") REFERENCES "trip_documents"("company_id","id")',
    )
    expect(instructions).toContain(
      'FOREIGN KEY ("company_id","conversation_id") REFERENCES "occurrence_conversations"("company_id","id")',
    )
    expect(instructions).toContain(
      '"occurrence_conversations" ("company_id","trip_document_id","participant") WHERE "subject_type" = \'document\'',
    )
    expect(instructions).toContain(
      '"occurrence_conversations" ("company_id","trip_id","participant") WHERE "subject_type" = \'trip\'',
    )
  })

  test('o rollback recusa antes de qualquer DROP e fecha com o journal contado', async () => {
    const { directory, text } = await readMigration('rollback.sql')
    const order = [
      'BEGIN;',
      "RAISE EXCEPTION 'conversas de nota/viagem existem; decidir antes de reverter",
      'DROP CONSTRAINT IF EXISTS "occurrence_conversation_uploads_subject_check"',
      'ALTER COLUMN "occurrence_kind" SET NOT NULL',
      `WHERE "name" = '${directory}'`,
      'ROW_COUNT',
      'COMMIT;',
    ].map((fragment) => positionOf(text, fragment))

    expect(order).toEqual(order.toSorted((left, right) => left - right))
    expect(withoutComments(text)).not.toMatch(/\bCASCADE\b|\bUPDATE\b|\bDELETE FROM "occurrence_/u)
    expect(text.trimEnd()).toEndWith('COMMIT;')
  })
})
