/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 329: histórico de valores (append-only), link do boleto e categorias novas entram aditivos; o rollback recusa com dado.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_company_expense_amount_changes_bill_url_categories'

async function readMigration(file: string): Promise<string> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('amount-changes migration is required')
  return Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--.*$/gmu, '')
}

describe('histórico de valores da conta (spec 329)', () => {
  test('tabela nova, coluna nula e categorias idempotentes, sem DROP', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    expect(text).toContain('CREATE TABLE "company_expense_amount_changes"')
    expect(text).toContain('ALTER TABLE "company_expenses" ADD COLUMN "bill_url" varchar(500)')
    expect(text).toContain(
      'ON CONFLICT ON CONSTRAINT "company_expense_categories_company_name_unique" DO NOTHING',
    )
    expect(text).toContain("('Financiamentos', 13)")
    expect(text).not.toMatch(/\bDROP\b/u)
  })

  test('o rollback recusa com histórico ou link e tira a linha do diário', async () => {
    const text = await readMigration('rollback.sql')
    expect(text).toContain('RAISE EXCEPTION')
    expect(text).toContain('company_expense_amount_changes')
    expect(text).toContain('"bill_url" IS NOT NULL')
    expect(text).toContain('__drizzle_migrations')
  })
})
