/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T1.2: o módulo Contas entra aditivo — três tabelas novas e a semente das categorias. O rollback recusa
 * rodar com conta ou ocorrência gravada.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_company_expenses'

async function readMigration(file: string): Promise<string> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('company_expenses migration is required')
  return Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--.*$/gmu, '')
}

describe('o módulo Contas entra aditivo (spec 325 T1.2)', () => {
  test('só cria tabelas novas e semeia categorias, sem DROP nem ALTER de tabela existente', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    for (const table of [
      'company_expense_categories',
      'company_expenses',
      'company_expense_occurrences',
    ]) {
      expect(text).toContain(`CREATE TABLE "${table}"`)
    }
    expect(text).toContain('"payee_driver_id" uuid')
    expect(text).toContain('"vehicle_id" uuid')
    expect(text).toContain('"slot" smallint')
    expect(text).toContain('UNIQUE("expense_id","competence","slot")')
    expect(text).not.toMatch(/\bUPDATE\b(?! CASCADE)/u)
    expect(text).not.toMatch(/\bDROP\b/u)
    const created = new Set([...text.matchAll(/CREATE TABLE "([^"]+)"/gu)].map((match) => match[1]))
    const altered = [...text.matchAll(/ALTER TABLE "([^"]+)"/gu)].map((match) => match[1])
    expect(altered.filter((table) => !created.has(table ?? ''))).toEqual([])
  })

  test('semeia as oito categorias, só a de motorista exige motorista', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    for (const name of [
      'Aluguel',
      'Folha',
      'Impostos',
      'Seguro',
      'Manutenção',
      'Combustível',
      'Pagamento de motorista/agregado',
      'Outros',
    ]) {
      expect(text).toContain(`'${name}'`)
    }
    expect(text.match(/, true, \d\)/gu)).toHaveLength(1)
  })

  test('o rollback recusa dado gravado e desfaz só as três tabelas', async () => {
    const text = withoutComments(await readMigration('rollback.sql'))
    expect(text).toContain('refusing to drop the spec 325 T1.2 tables')
    expect(text).toContain('DROP TABLE "company_expense_occurrences";')
    expect(text).toContain('DROP TABLE "company_expenses";')
    expect(text).toContain('DROP TABLE "company_expense_categories";')
    expect(text).not.toContain('DROP TABLE "fleet_')
  })
})
