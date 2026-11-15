/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 328: "quem causou a conta" entra aditivo (coluna nula, índice parcial e FK composta com a frota). O rollback recusa
 * rodar com conta que tenha causador.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_company_expense_caused_by'

async function readMigration(file: string): Promise<string> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('caused-by migration is required')
  return Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--.*$/gmu, '')
}

describe('quem causou a conta entra aditivo (spec 328)', () => {
  test('uma coluna nula, índice parcial e FK da mesma empresa, sem DROP nem NOT NULL', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    expect(text).toContain('ALTER TABLE "company_expenses" ADD COLUMN "caused_by_driver_id" uuid')
    expect(text).toContain('FOREIGN KEY ("company_id","caused_by_driver_id")')
    expect(text).toContain('REFERENCES "fleet_drivers"("company_id","id")')
    expect(text).toContain('WHERE "caused_by_driver_id" is not null')
    expect(text).not.toMatch(/\bDROP\b/u)
    expect(text).not.toMatch(/\bDELETE FROM\b/u)
    expect(text).not.toMatch(/\bNOT NULL\b/u)
  })

  test('o rollback recusa conta com causador e tira a linha do diário', async () => {
    const text = withoutComments(await readMigration('rollback.sql'))
    expect(text).toContain('"caused_by_driver_id" IS NOT NULL')
    expect(text).toContain('RAISE EXCEPTION')
    expect(text).toContain('DROP COLUMN "caused_by_driver_id"')
    expect(text).toContain('"name" = \'20261115154136_company_expense_caused_by\'')
    expect(text).toContain('deleted_migrations <> 1')
  })
})
