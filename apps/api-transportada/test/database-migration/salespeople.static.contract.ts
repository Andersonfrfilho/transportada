/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 316 T1.2: a migration do vendedor é só tabela nova (sem UPDATE e sem DROP), toda chave estrangeira leva
 * `company_id` e o rollback recusa rodar com vendedor cadastrado.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_salespeople'
const POSTGRES_IDENTIFIER_MAX_LENGTH = 63
const TABLES = [
  'contractor_salespeople',
  'contractor_salesperson_links',
  'contractor_salesperson_clients',
] as const
const NAMES = [
  'contractor_salespeople_company_phone_key_unique',
  'contractor_salesperson_links_salesperson_fk',
  'contractor_salesperson_links_company_id_id_unique',
  'contractor_salesperson_clients_link_tax_id_unique',
  'contractor_salesperson_clients_client_fk',
] as const

async function readMigration(file: string): Promise<string> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('salespeople migration is required')
  return Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--.*$/gmu, '')
}

describe('o vendedor entra aditivo (spec 316 T1.2)', () => {
  test('todo nome de constraint cabe em 63 caracteres', () => {
    for (const name of NAMES)
      expect(name.length).toBeLessThanOrEqual(POSTGRES_IDENTIFIER_MAX_LENGTH)
  })

  test('só cria tabela nova, sem UPDATE nem DROP', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    for (const table of TABLES) expect(text).toContain(`CREATE TABLE "${table}"`)
    expect(text).not.toMatch(/\bUPDATE\s+"/u)
    expect(text).not.toMatch(/\bDROP\b/u)
  })

  test('as chaves estrangeiras entre tabelas do vendedor e da contratante levam company_id', async () => {
    const text = await readMigration('migration.sql')
    const foreignKeys = text.match(/FOREIGN KEY \([^)]*\)/gu) ?? []
    expect(foreignKeys.length).toBe(5)
    for (const key of foreignKeys) expect(key).toContain('"company_id"')
  })

  test('a carteira só aceita cliente da mesma empresa', async () => {
    const text = await readMigration('migration.sql')
    expect(text).toContain(
      'FOREIGN KEY ("company_id","tax_id") REFERENCES "delivery_clients"("company_id","tax_id")',
    )
  })

  test('o rollback recusa rodar com vendedor cadastrado e tira a entrada do diário', async () => {
    const text = await readMigration('rollback.sql')
    expect(text).toContain('refusing to drop the spec 316 tables')
    expect(text).toContain('WHERE "name" = \'20261110191104_salespeople\'')
    const drops = TABLES.map((table) => text.indexOf(`DROP TABLE "${table}"`))
    expect(drops.every((position) => position > 0)).toBe(true)
    // dependentes primeiro: carteira, ligação, vendedor
    expect(drops[2]).toBeLessThan(drops[1] ?? 0)
    expect(drops[1]).toBeLessThan(drops[0] ?? 0)
  })
})
