/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T7.2 (RF24 a RF31): o schema dos lembretes de vencimento e da baixa por resposta entra aditivo, com a chave
 * única que torna a rotina idempotente. O rollback recusa rodar com dado dos lembretes.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
  COMPANY_EXPENSE_REMINDER_CHANNELS,
  COMPANY_EXPENSE_REMINDER_KINDS,
  COMPANY_EXPENSE_REPLY_CHANNELS,
} from '../../src/database/company-expense.schema.js'
import {
  DEFAULT_REMINDER_SETTINGS,
  type ReminderChannel,
  type ReminderKind,
  type ReplyChannel,
} from '../../src/expenses/application/expense-reminder.port.js'
import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_company_expense_reminders'

async function readMigration(file: string): Promise<string> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('company_expense_reminders migration is required')
  return Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--.*$/gmu, '')
}

const NEW_TABLES = [
  'company_expense_reminder_settings',
  'company_expense_reminders_sent',
  'company_expense_reply_links',
  'company_expense_summaries_sent',
] as const

const list = (values: readonly string[]): string => values.map((v) => `'${v}'`).join(', ')

describe('os lembretes de vencimento entram aditivos (spec 325 T7.2)', () => {
  test('quatro tabelas novas e três colunas nulas, sem DROP nem DELETE', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    for (const table of NEW_TABLES) expect(text).toContain(`CREATE TABLE "${table}"`)
    expect(text).toContain('ALTER TABLE "company_expenses" ADD COLUMN "responsible_user_id" uuid;')
    expect(text).toContain(
      'ALTER TABLE "company_expense_occurrences" ADD COLUMN "settled_via_channel" varchar(16);',
    )
    expect(text).toContain(
      'ALTER TABLE "company_expense_occurrences" ADD COLUMN "settled_by_reply_at" timestamp with time zone;',
    )
    expect(text).not.toMatch(/\bDROP\b/u)
    expect(text).not.toMatch(/\bDELETE FROM\b/u)
    expect(text).not.toMatch(/^UPDATE\b/mu)
  })

  test('a chave do aviso é (ocorrência, responsável, dia, tipo) e o canal não entra', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    expect(text).toContain(
      'CONSTRAINT "company_expense_reminders_sent_key_unique" UNIQUE("occurrence_id","recipient_user_id","day","kind")',
    )
    expect(text).toContain(
      'CONSTRAINT "company_expense_summaries_sent_key_unique" UNIQUE("company_id","recipient_user_id","day")',
    )
  })

  test('as listas fechadas da migration são as do schema e as da porta', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    expect(text).toContain(`"kind" in (${list(COMPANY_EXPENSE_REMINDER_KINDS)})`)
    expect(text).toContain(`"channel" in (${list(COMPANY_EXPENSE_REMINDER_CHANNELS)})`)
    expect(text).toContain(`"settled_via_channel" in (${list(COMPANY_EXPENSE_REPLY_CHANNELS)})`)
    const kinds: readonly ReminderKind[] = COMPANY_EXPENSE_REMINDER_KINDS
    const channels: readonly ReminderChannel[] = COMPANY_EXPENSE_REMINDER_CHANNELS
    const replyChannels: readonly ReplyChannel[] = COMPANY_EXPENSE_REPLY_CHANNELS
    expect(kinds).toHaveLength(3)
    expect(channels).toHaveLength(3)
    expect(replyChannels).toHaveLength(2)
  })

  test('o padrão da migration é o da porta (3 dias antes, 3 de atraso, só e-mail, sem resumo às 08h)', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    expect(text).toContain(
      `"days_before" smallint DEFAULT ${DEFAULT_REMINDER_SETTINGS.daysBefore} NOT NULL`,
    )
    expect(text).toContain(
      `"max_overdue_notices" smallint DEFAULT ${DEFAULT_REMINDER_SETTINGS.maxOverdueNotices} NOT NULL`,
    )
    expect(text).toContain('"email_enabled" boolean DEFAULT true NOT NULL')
    expect(text).toContain('"whatsapp_enabled" boolean DEFAULT false NOT NULL')
    expect(text).toContain('"push_enabled" boolean DEFAULT false NOT NULL')
    expect(DEFAULT_REMINDER_SETTINGS.enabledChannels).toEqual(['email'])
    expect(text).toContain('"daily_summary_enabled" boolean DEFAULT false NOT NULL')
    expect(text).toContain('"daily_summary_hour" smallint DEFAULT 8 NOT NULL')
  })

  test('o link guarda só o hash do token (SHA-256 em hex), nunca o token', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    expect(text).toContain('"token_hash" varchar(64) NOT NULL')
    expect(text).toContain(`"token_hash" ~ '^[0-9a-f]{64}$'`)
    expect(text).not.toMatch(/"token"\s/u)
  })

  test('toda tabela nova tem política no recorte de staging (spec 291)', async () => {
    const policy = await Bun.file(
      join(import.meta.dir, '../../../../deploy/staging-refresh/prune-source.sql'),
    ).text()
    for (const table of NEW_TABLES) expect(policy).toContain(`('${table}', `)
    // configuração vai inteira; registro de envio e link de uso único não atravessam para staging.
    expect(policy).toContain("('company_expense_reminder_settings', 'keep', null)")
    for (const table of [
      'company_expense_reminders_sent',
      'company_expense_reply_links',
      'company_expense_summaries_sent',
    ])
      expect(policy).toContain(`('${table}', 'empty', null)`)
  })

  test('o rollback é manual, recusa com dado dos lembretes e limpa o diário', async () => {
    const text = await readMigration('rollback.sql')
    expect(text).toContain('Manual rollback only')
    expect(text).toContain('refusing to drop')
    for (const table of NEW_TABLES) expect(text).toContain(`DROP TABLE "${table}"`)
    expect(text).toContain('DROP COLUMN "responsible_user_id"')
    expect(text).toContain('DROP COLUMN "settled_via_channel"')
    expect(text).toContain('DROP COLUMN "settled_by_reply_at"')
    expect(text).toContain("'20261114001611_company_expense_reminders'")
  })
})
