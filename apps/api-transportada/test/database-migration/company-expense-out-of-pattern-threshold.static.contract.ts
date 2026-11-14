/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T6.3 (RF23): o limite do fora do padrão entra aditivo, com padrão de 10%. O rollback recusa rodar com limite
 * personalizado.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_company_expense_out_of_pattern_threshold'

async function readMigration(file: string): Promise<string> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('out_of_pattern_threshold migration is required')
  return Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--.*$/gmu, '')
}

describe('o limite do fora do padrão entra aditivo (spec 325 T6.3)', () => {
  test('uma coluna com padrão de 10% e um CHECK, sem DROP nem outra tabela', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    expect(text).toContain(
      'ALTER TABLE "company_expense_allocation_settings" ADD COLUMN "out_of_pattern_threshold_percent" numeric(6,2) DEFAULT \'10.00\' NOT NULL',
    )
    expect(text).toContain('"out_of_pattern_threshold_percent" >= 0')
    expect(text).toContain('"out_of_pattern_threshold_percent" <= 1000')
    expect(text).not.toMatch(/\bDROP\b/u)
    expect(text).not.toMatch(/\bDELETE FROM\b/u)
    const altered = new Set(
      [...text.matchAll(/ALTER TABLE "([^"]+)"/gu)].map((match) => match[1] ?? ''),
    )
    expect([...altered]).toEqual(['company_expense_allocation_settings'])
  })

  test('o rollback recusa limite personalizado e tira a linha do diário', async () => {
    const text = withoutComments(await readMigration('rollback.sql'))
    expect(text).toContain('"out_of_pattern_threshold_percent" <> 10')
    expect(text).toContain('RAISE EXCEPTION')
    expect(text).toContain('DROP COLUMN "out_of_pattern_threshold_percent"')
    expect(text).toContain('"name" = \'20261114005633_company_expense_out_of_pattern_threshold\'')
    expect(text).toContain('deleted_migrations <> 1')
  })
})
