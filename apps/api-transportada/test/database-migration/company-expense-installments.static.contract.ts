/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 (extensão parcelas): o total de parcelas da conta e o número da parcela da ocorrência entram aditivos. O rollback
 * recusa rodar com conta parcelada.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_company_expense_installments'

async function readMigration(file: string): Promise<string> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('installments migration is required')
  return Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--.*$/gmu, '')
}

describe('as parcelas da conta entram aditivas (spec 325)', () => {
  test('duas colunas nulas e um CHECK, sem DROP nem tabela nova', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    expect(text).toContain(
      'ALTER TABLE "company_expenses" ADD COLUMN "installments_total" smallint',
    )
    expect(text).toContain(
      'ALTER TABLE "company_expense_occurrences" ADD COLUMN "installment_number" smallint',
    )
    expect(text).toContain('"installments_total" between 2 and 600')
    expect(text).not.toMatch(/\bDROP\b/u)
    expect(text).not.toMatch(/\bDELETE FROM\b/u)
    expect(text).not.toMatch(/\bNOT NULL\b/u)
  })

  test('o rollback recusa conta parcelada e tira a linha do diário', async () => {
    const text = withoutComments(await readMigration('rollback.sql'))
    expect(text).toContain('"installments_total" IS NOT NULL')
    expect(text).toContain('RAISE EXCEPTION')
    expect(text).toContain('DROP COLUMN "installments_total"')
    expect(text).toContain('DROP COLUMN "installment_number"')
    expect(text).toContain('"name" = \'20261115034548_company_expense_installments\'')
    expect(text).toContain('deleted_migrations <> 1')
  })
})
