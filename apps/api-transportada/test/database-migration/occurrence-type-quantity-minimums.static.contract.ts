/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1c.1: a ordem da migration é a decisão. As colunas das exceções nascem nulas, as do
 * tipo com padrão constante; as CHECKs só entram depois das colunas que elas leem. O rollback
 * desfaz só o que a 246 criou aqui: `items_mode` do tipo e as CHECKs da 241 ficam.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_type_quantity_minimums'
const TYPES = '"company_occurrence_types"'
const CONTRACTOR = '"company_occurrence_type_contractor_overrides"'
const RECIPIENT = '"company_occurrence_type_recipient_overrides"'

async function readMigration(file: string): Promise<{ directory: string; text: string }> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('occurrence_type_quantity_minimums is required')
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

describe('a quantidade mínima vira dado na ordem do plan (spec 246 T1c.1)', () => {
  test('colunas das exceções nulas → colunas do tipo → UPDATE → NOT NULL → CHECKs', async () => {
    const { text } = await readMigration('migration.sql')
    const order = [
      `ALTER TABLE ${CONTRACTOR} ADD COLUMN "items_mode" varchar(16);`,
      `ALTER TABLE ${RECIPIENT} ADD COLUMN "items_minimum_count" smallint;`,
      `ALTER TABLE ${TYPES} ADD COLUMN "photo_minimum_count" smallint;`,
      `ALTER TABLE ${TYPES} ADD COLUMN "items_minimum_count" smallint;`,
      `UPDATE ${TYPES} SET "photo_minimum_count" = 1;`,
      `ALTER TABLE ${TYPES} ALTER COLUMN "photo_minimum_count" SET DEFAULT 1;`,
      `ALTER TABLE ${TYPES} ALTER COLUMN "photo_minimum_count" SET NOT NULL;`,
      '"company_occurrence_types_photo_minimum_count_check"',
      '"company_occurrence_types_items_minimum_shape_check"',
    ].map((fragment) => positionOf(text, fragment))

    expect(order).toEqual(order.toSorted((left, right) => left - right))
    const instructions = withoutComments(text)
    // A 241 é dona de `items_mode` do tipo: esta migration não o recria nem o derruba.
    expect(instructions).not.toMatch(new RegExp(`${TYPES} ADD COLUMN "items_mode"`, 'u'))
    expect(instructions).not.toMatch(/\bDROP\b/u)
    // T1c.2: um único UPDATE, no tipo, e só do mínimo de foto — `items_mode` e as exceções ficam como estão.
    expect(instructions.match(/\bUPDATE\b/gu)).toHaveLength(1)
    // A exceção não repete a CHECK `off ⇒ unset`: a política de reentrega é do tipo.
    expect(instructions).not.toMatch(/overrides" ADD CONSTRAINT [^;]*redelivery_policy/u)
  })

  test('o rollback desfaz só a 246 desta migration, e não toca a 241', async () => {
    const { directory, text } = await readMigration('rollback.sql')
    const order = [
      'BEGIN;',
      '"company_occurrence_types_items_minimum_shape_check"',
      '"occurrence_type_contractor_overrides_items_mode_check"',
      'DROP COLUMN IF EXISTS "photo_minimum_count"',
      `WHERE "name" = '${directory}'`,
      'ROW_COUNT',
    ].map((fragment) => positionOf(text, fragment))

    expect(order).toEqual(order.toSorted((left, right) => left - right))
    const instructions = withoutComments(text)
    expect(instructions).not.toMatch(/"company_occurrence_types_items_mode_check"|items_off_shape/u)
    expect(instructions).not.toMatch(
      new RegExp(`${TYPES}\\s+[^;]*DROP COLUMN IF EXISTS "items_mode"`, 'u'),
    )
    expect(text.trimEnd()).toEndWith('COMMIT;')
  })
})
