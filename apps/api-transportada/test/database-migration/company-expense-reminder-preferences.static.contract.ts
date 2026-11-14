/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T7.3 (RF26): a preferência de canal por pessoa entra aditiva, com WhatsApp e push desligados (opt-in) e uma
 * linha por pessoa e empresa. O rollback recusa rodar com preferência gravada.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_company_expense_reminder_preferences'

async function readMigration(file: string): Promise<string> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) {
    throw new Error('company_expense_reminder_preferences migration is required')
  }
  return Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
}

const withoutComments = (sqlText: string): string => sqlText.replaceAll(/^--.*$/gmu, '')

describe('a preferência de canal dos lembretes entra aditiva (spec 325 T7.3)', () => {
  test('uma tabela nova, sem DROP, DELETE nem UPDATE', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    expect(text).toContain('CREATE TABLE "company_expense_reminder_preferences"')
    expect(text).not.toMatch(/\bDROP\b/u)
    expect(text).not.toMatch(/\bDELETE FROM\b/u)
    expect(text).not.toMatch(/^UPDATE\b/mu)
  })

  test('WhatsApp e push nascem desligados, uma linha por pessoa e empresa, sem coluna de e-mail', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    expect(text).toContain('"whatsapp_enabled" boolean DEFAULT false NOT NULL')
    expect(text).toContain('"push_enabled" boolean DEFAULT false NOT NULL')
    expect(text).not.toContain('"email_enabled"')
    expect(text).toContain(
      'CONSTRAINT "company_expense_reminder_preferences_company_user_unique" UNIQUE("company_id","user_id")',
    )
  })

  test('tem política no recorte de staging (spec 291): é configuração, vai inteira', async () => {
    const policy = await Bun.file(
      join(import.meta.dir, '../../../../deploy/staging-refresh/prune-source.sql'),
    ).text()
    expect(policy).toContain("('company_expense_reminder_preferences', 'keep', null)")
  })

  test('o rollback é manual, recusa com preferência gravada e limpa o diário', async () => {
    const text = await readMigration('rollback.sql')
    expect(text).toContain('Manual rollback only')
    expect(text).toContain('refusing to drop')
    expect(text).toContain('DROP TABLE "company_expense_reminder_preferences"')
    expect(text).toContain("'20261114004108_company_expense_reminder_preferences'")
  })
})
