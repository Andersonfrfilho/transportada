/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T5.1 (D11): a migration do público `driver_reply` é aditiva (só alarga o CHECK de `audience`,
 * sem apagar nem reescrever linha) e o rollback recusa com linha `driver_reply`, restaura o CHECK antigo e
 * fecha o journal contado.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_quick_reply_driver_audience'

async function readMigration(file: string): Promise<{ directory: string; text: string }> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('quick_reply_driver_audience is required')
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

describe('o público driver_reply das respostas rápidas (spec 263 T5.1)', () => {
  test('a migration é aditiva: só troca o CHECK de audience, e ele aceita os três públicos', async () => {
    const instructions = withoutComments((await readMigration('migration.sql')).text)

    expect(instructions.match(/\bALTER TABLE\b/gu)).toHaveLength(1)
    expect(instructions).toContain(`CHECK ("audience" in ('contractor', 'driver', 'driver_reply'))`)
    expect(instructions).not.toMatch(
      /\bDELETE\b|\bUPDATE\b|\bTRUNCATE\b|\bDROP (?:TABLE|COLUMN|INDEX)\b/u,
    )
  })

  test('o rollback recusa com linha driver_reply, restaura o CHECK antigo e fecha o journal contado', async () => {
    const { directory, text } = await readMigration('rollback.sql')
    const order = [
      'BEGIN;',
      "SET LOCAL lock_timeout = '3s';",
      `WHERE "audience" = 'driver_reply'`,
      'RAISE EXCEPTION',
      'DROP CONSTRAINT "company_quick_replies_audience_check"',
      `CHECK ("audience" in ('contractor', 'driver'))`,
      `WHERE "name" = '${directory}'`,
      'ROW_COUNT',
      'COMMIT;',
    ].map((fragment) => positionOf(text, fragment))

    expect(order).toEqual(order.toSorted((left, right) => left - right))
    expect(withoutComments(text).match(/RAISE EXCEPTION/gu)).toHaveLength(2)
    expect(withoutComments(text)).not.toMatch(/\bCASCADE\b|\bUPDATE\b/u)
    expect(text.trimEnd()).toEndWith('COMMIT;')
  })
})
