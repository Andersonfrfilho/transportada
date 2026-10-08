/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * The recipient e-mail migration is additive: one nullable `recipient_email` without a default, the
 * CHECK only after the column, no `UPDATE`. The rollback drops only what this migration created and
 * removes its journal entry with a `ROW_COUNT` guard.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { NFE_RECIPIENT_EMAIL_CONSTRAINT } from './nfe-recipient-email.assertion.js'
import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_nfe_recipient_email'
const ADD_COLUMN = 'ALTER TABLE "nfe_documents" ADD COLUMN "recipient_email" text;'

async function readMigration(file: string): Promise<{ directory: string; text: string }> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('nfe_recipient_email is required')
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

describe('the NF-e recipient e-mail enters additive', () => {
  test('one nullable column without default, the CHECK after it, no UPDATE', async () => {
    const { text } = await readMigration('migration.sql')
    const instructions = withoutComments(text)

    expect(instructions.match(/ADD COLUMN/gu)).toHaveLength(1)
    expect(instructions).toContain(ADD_COLUMN)
    expect(instructions).not.toMatch(/\bDEFAULT\b|\bNOT NULL\b/u)
    expect(positionOf(instructions, ADD_COLUMN)).toBeLessThan(
      positionOf(instructions, `ADD CONSTRAINT "${NFE_RECIPIENT_EMAIL_CONSTRAINT}"`),
    )
    expect(instructions).toContain('length("recipient_email") <= 254')
    expect(instructions).not.toMatch(/\bUPDATE\b|\bDROP\b|\bDELETE\b/u)
  })

  test('the rollback drops the CHECK, then the column, then the journal entry with ROW_COUNT', async () => {
    const { directory, text } = await readMigration('rollback.sql')
    const order = [
      'BEGIN;',
      `DROP CONSTRAINT IF EXISTS "${NFE_RECIPIENT_EMAIL_CONSTRAINT}"`,
      'DROP COLUMN IF EXISTS "recipient_email"',
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
