/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * The occurrence type icon migration is additive: one nullable `icon_name` without a default, the
 * CHECK only after the column, no `UPDATE`, and nothing on the override tables. The rollback drops
 * only what this migration created and removes its journal entry with a `ROW_COUNT` guard.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { OCCURRENCE_TYPE_ICON_NAMES } from '../../src/shared/trip-occurrence.constant.js'
import { OCCURRENCE_TYPE_ICON_CONSTRAINT } from './occurrence-type-icon.assertion.js'
import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_type_icon'
const ADD_COLUMN = 'ALTER TABLE "company_occurrence_types" ADD COLUMN "icon_name" varchar(32);'

async function readMigration(file: string): Promise<{ directory: string; text: string }> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('occurrence_type_icon is required')
  const text = await Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
  return { directory, text }
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--.*$/gmu, '')
}

function positionOf(sqlText: string, fragment: string): number {
  const position = sqlText.indexOf(fragment)
  if (position < 0) throw new Error(`Missing fragment: ${fragment}`)
  return position
}

describe('the occurrence type icon enters additive', () => {
  test('one nullable column without default, the CHECK after it, no UPDATE, no override table', async () => {
    const { text } = await readMigration('migration.sql')
    const instructions = withoutComments(text)

    expect(instructions.match(/ADD COLUMN/gu)).toHaveLength(1)
    expect(instructions).toContain(ADD_COLUMN)
    expect(instructions).not.toMatch(/\bDEFAULT\b|\bNOT NULL\b/u)
    expect(positionOf(instructions, ADD_COLUMN)).toBeLessThan(
      positionOf(instructions, `ADD CONSTRAINT "${OCCURRENCE_TYPE_ICON_CONSTRAINT}"`),
    )
    const catalog = OCCURRENCE_TYPE_ICON_NAMES.map((name) => `'${name}'`).join(', ')
    expect(instructions).toContain(`CHECK ("icon_name" is null or "icon_name" in (${catalog}))`)
    expect(instructions).not.toMatch(/\bUPDATE\b|\bDROP\b|\bDELETE\b/u)
    expect(instructions).not.toMatch(/_overrides"|_moments"/u)
  })

  test('the rollback drops the CHECK, then the column, then the journal entry with ROW_COUNT', async () => {
    const { directory, text } = await readMigration('rollback.sql')
    const order = [
      'BEGIN;',
      `DROP CONSTRAINT IF EXISTS "${OCCURRENCE_TYPE_ICON_CONSTRAINT}"`,
      'DROP COLUMN IF EXISTS "icon_name"',
      `WHERE "name" = '${directory}'`,
      'ROW_COUNT',
      'COMMIT;',
    ].map((fragment) => positionOf(text, fragment))

    expect(order).toEqual(order.toSorted((left, right) => left - right))
    const instructions = withoutComments(text)
    expect(instructions.match(/DROP COLUMN/gu)).toHaveLength(1)
    expect(instructions.match(/DROP CONSTRAINT/gu)).toHaveLength(1)
    expect(instructions).not.toMatch(/\bCASCADE\b|\bUPDATE\b/u)
    expect(text.trimEnd()).toEndWith('COMMIT;')
  })
})
