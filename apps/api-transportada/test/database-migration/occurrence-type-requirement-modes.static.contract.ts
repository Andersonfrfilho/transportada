/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1.2: a ordem da migration é a decisão. As colunas do tipo nascem com padrão constante
 * (não reescreve a tabela), as das exceções nulas; os `UPDATE`s levam a regra fixa da 179 para o
 * dado — o da exceção em TODA linha, senão uma exceção `optional` sobre tipo `required` herdaria a
 * observação obrigatória —; as CHECKs só entram sobre dado conforme; `signature_object_id` por
 * último. O rollback desfaz só o que a 246 criou: `items_mode` e as CHECKs da 241 ficam.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_type_requirement_modes'
const TYPES = '"company_occurrence_types"'
const CONTRACTOR = '"company_occurrence_type_contractor_overrides"'
const RECIPIENT = '"company_occurrence_type_recipient_overrides"'
const NOTE_FOLLOWS_PHOTO = `SET "note_mode" = CASE WHEN "attachment_mode" = 'required' THEN 'required' ELSE 'optional' END;`

async function readMigration(file: string): Promise<{ directory: string; text: string }> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('occurrence_type_requirement_modes is required')
  const text = await Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
  return { directory, text }
}

/** Os comentários explicam o que não se toca; só as instruções contam. */
function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--.*$/gmu, '')
}

function positionOf(sqlText: string, fragment: string): number {
  const position = sqlText.indexOf(fragment)
  if (position < 0) throw new Error(`Missing fragment: ${fragment}`)
  return position
}

describe('a exigência vira dado na ordem do plan (spec 246 T1.2)', () => {
  test('colunas do tipo → das exceções → UPDATEs → CHECKs → signature_object_id', async () => {
    const { text } = await readMigration('migration.sql')
    const order = [
      `ALTER TABLE ${TYPES} ADD COLUMN "note_mode" varchar(16) DEFAULT 'optional' NOT NULL;`,
      `ALTER TABLE ${TYPES} ADD COLUMN "signature_mode" varchar(16) DEFAULT 'off' NOT NULL;`,
      `ALTER TABLE ${CONTRACTOR} ADD COLUMN "note_mode" varchar(16);`,
      `ALTER TABLE ${RECIPIENT} ADD COLUMN "signature_mode" varchar(16);`,
      `UPDATE ${TYPES} SET "note_mode" = 'required' WHERE "attachment_mode" = 'required';`,
      `UPDATE ${CONTRACTOR} ${NOTE_FOLLOWS_PHOTO}`,
      `UPDATE ${RECIPIENT} ${NOTE_FOLLOWS_PHOTO}`,
      '"company_occurrence_types_note_mode_check"',
      '"occurrence_type_recipient_overrides_signature_mode_check"',
      'ADD COLUMN "signature_object_id" uuid;',
      '"trip_stop_occurrences_company_signature_object_fk"',
    ].map((fragment) => positionOf(text, fragment))

    expect(order).toEqual(order.toSorted((left, right) => left - right))
    // A assinatura das exceções fica nula: nada a preservar, o tipo nasce `off`.
    expect(withoutComments(text)).not.toMatch(/SET "signature_mode"/u)
    expect(withoutComments(text)).not.toMatch(/\bDROP\b|\bINSERT\b|items_mode/u)
  })

  test('o rollback desfaz só a 246, em ordem inversa, e não toca a 241', async () => {
    const { directory, text } = await readMigration('rollback.sql')
    const order = [
      'BEGIN;',
      '"trip_document_occurrences_company_signature_object_fk"',
      'DROP COLUMN IF EXISTS "signature_object_id"',
      '"company_occurrence_types_note_mode_check"',
      'DROP COLUMN IF EXISTS "note_mode"',
      `WHERE "name" = '${directory}'`,
      'ROW_COUNT',
    ].map((fragment) => positionOf(text, fragment))

    expect(order).toEqual(order.toSorted((left, right) => left - right))
    expect(withoutComments(text)).not.toMatch(/items_mode|items_off_shape/u)
    expect(text.trimEnd()).toEndWith('COMMIT;')
  })
})
