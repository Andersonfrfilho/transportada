/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 318 T1: a migration do canal de ocorrência é aditiva (tabela nova, sem UPDATE/DELETE/DROP) e o
 * rollback recusa com canal de grupo gravado, derruba só a tabela e tira a entrada do diário com ROW_COUNT.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_contractor_occurrence_channels'

async function readMigration(file: string): Promise<{ directory: string; text: string }> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('contractor_occurrence_channels is required')
  const text = await Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
  return { directory, text }
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--.*$/gmu, '')
}

describe('the contractor occurrence channel enters additive', () => {
  test('one new table, e-mail by default, no rewrite of existing rows', async () => {
    const { text } = await readMigration('migration.sql')
    const instructions = withoutComments(text)

    expect(instructions.match(/CREATE TABLE/gu)).toHaveLength(1)
    expect(instructions).toContain('"channel" text DEFAULT \'email\' NOT NULL')
    expect(instructions).toContain('"email_fallback" boolean DEFAULT true NOT NULL')
    expect(instructions).toContain("\"channel\" in ('email', 'whatsapp_group')")
    expect(instructions).not.toMatch(/^(?:UPDATE|DELETE|DROP)\b/mu)
    expect(instructions).not.toMatch(/^ALTER TABLE "(?!contractor_occurrence_channels")/mu)
  })

  test('the rollback refuses configured groups, drops the table, then the journal entry', async () => {
    const { directory, text } = await readMigration('rollback.sql')
    const order = [
      'BEGIN;',
      'RAISE EXCEPTION',
      'DROP TABLE "contractor_occurrence_channels"',
      `WHERE "name" = '${directory}'`,
      'ROW_COUNT',
      'COMMIT;',
    ].map((fragment) => {
      const position = text.indexOf(fragment)
      if (position < 0) throw new Error(`Missing fragment: ${fragment}`)
      return position
    })

    expect(order).toEqual(order.toSorted((left, right) => left - right))
    expect(withoutComments(text)).not.toMatch(/\bCASCADE\b/u)
    expect(text.trimEnd()).toEndWith('COMMIT;')
  })
})
