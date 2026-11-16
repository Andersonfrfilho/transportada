/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T1.4b: as viagens do pagamento entram aditivas — uma tabela nova, chave por (viagem, parcela, pessoa), já
 * pronta para o ajudante da T1.4c. O rollback recusa rodar com viagem incluída.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_company_expense_occurrence_trips'

async function readMigration(file: string): Promise<string> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined)
    throw new Error('company_expense_occurrence_trips migration is required')
  return Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--.*$/gmu, '')
}

describe('as viagens do pagamento entram aditivas (spec 325 T1.4b)', () => {
  test('só cria a tabela nova, sem DROP nem ALTER de tabela existente', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    expect(text).toContain('CREATE TABLE "company_expense_occurrence_trips"')
    expect(text).not.toMatch(/\bUPDATE\b(?! CASCADE)/u)
    expect(text).not.toMatch(/\bDROP\b/u)
    const altered = [...text.matchAll(/ALTER TABLE "([^"]+)"/gu)].map((match) => match[1])
    expect(altered.filter((table) => table !== 'company_expense_occurrence_trips')).toEqual([])
  })

  test('a parte de uma pessoa numa parcela da viagem é paga uma vez só; driver e helper já cabem (T1.4c)', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    expect(text).toContain('UNIQUE("trip_id","parcel_kind","driver_id")')
    expect(text).toContain(`CHECK ("parcel_kind" in ('driver', 'helper'))`)
    expect(text).toContain('"amount" numeric(14,2) NOT NULL')
  })

  test('o rollback recusa dado gravado e desfaz só a tabela nova', async () => {
    const text = withoutComments(await readMigration('rollback.sql'))
    expect(text).toContain('refusing to drop the spec 325 T1.4b table')
    expect(text).toContain('DROP TABLE "company_expense_occurrence_trips";')
    expect(text.match(/DROP TABLE/gu)).toHaveLength(1)
  })
})
