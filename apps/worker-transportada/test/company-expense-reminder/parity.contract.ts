/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T7.4: a regra de aviso vem do SDK nas duas apps (as apps não importam código uma da outra). O que ainda é
 * cópia por valor (valores e HTML do e-mail, SQL) segue cobrado abaixo.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8')
const W = '../../src/company-expense-reminder/'
const A = '../../../api-transportada/src/expenses/'

/** Os arquivos puros são idênticos fora da linha de importação e do comentário de cabeçalho. */
function body(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^import |^\} from |^ \*|^\/\*\*/u.test(line))
    .join('\n')
    .replace(/^\s*(Contratos|Spec)[^\n]*$/gmu, '')
}

describe('paridade dos lembretes com a API (spec 325 T7.4)', () => {
  test('a regra de quando, quem e por qual canal vem do mesmo pacote do SDK nas duas apps', async () => {
    const [worker, api] = await Promise.all([
      read(`${W}domain/expense-reminder.policy.ts`),
      read(`${A}domain/expense-reminder.policy.ts`),
    ])
    for (const source of [worker, api]) {
      expect(source).toContain("from '@adatechnology/expense-contracts'")
      for (const name of [
        'belongsToDailySummary',
        'chooseReminderRecipients',
        'civilDaysBetween',
        'daysUntilDue',
        'effectiveReminderChannels',
        'personalReminderChannels',
        'reminderKindOn',
      ]) {
        expect(source).toContain(`  ${name},`)
      }
      expect(source).not.toContain('function reminderKindOn')
      expect(source).not.toContain('function chooseReminderRecipients')
      // Os papéis da tripulação são da transportada e iguais nas duas apps.
      for (const marker of [
        "export const EXPENSE_REMINDER_DRIVING_ROLES = ['driver', 'aggregate', 'helper'] as const",
        "export const EXPENSE_REMINDER_NEUTRAL_ROLES = ['viewer'] as const",
        'isBarredFromReminders({',
      ]) {
        expect(source).toContain(marker)
      }
    }
  })

  test('a versão do pacote é a mesma, fixa, nas duas apps', async () => {
    const [worker, api] = await Promise.all([
      read('../../package.json'),
      read('../../../api-transportada/package.json'),
    ])
    const versionOf = (manifest: string): unknown =>
      (JSON.parse(manifest) as { dependencies?: Record<string, string> }).dependencies?.[
        '@adatechnology/expense-contracts'
      ]
    expect(versionOf(worker)).toMatch(/^\d+\.\d+\.\d+$/)
    expect(versionOf(worker)).toBe(versionOf(api))
  })

  test('os valores e o HTML do e-mail são os mesmos', async () => {
    const [worker, api] = await Promise.all([
      read(`${W}domain/expense-reminder-mail.policy.ts`),
      read(`${A}domain/expense-reminder-mail.policy.ts`),
    ])
    expect(body(worker)).toBe(body(api))
  })

  test('as chaves dos modelos e o HTML do sistema são os mesmos', async () => {
    const [worker, api] = await Promise.all([
      read(`${W}domain/company-expense-reminder.constant.ts`),
      read(`${A}domain/expense-reminder-mail-template.constant.ts`),
    ])
    for (const marker of [
      "export const EXPENSE_REMINDER_TEMPLATE_KEY = 'contas.aviso-vencimento'",
      "export const EXPENSE_DAILY_SUMMARY_TEMPLATE_KEY = 'contas.resumo-diario'",
      "export const EXPENSE_REMINDER_SYSTEM_HTML_VARIABLES = ['botaoJaPaguei', 'botaoAbrirContas'] as const",
    ]) {
      expect(api).toContain(marker)
      expect(worker).toContain(marker)
    }
  })

  test('o SQL do worker usa a mesma chave de conflito e os mesmos filtros da API', async () => {
    const [worker, apiSent, apiOccurrences, apiRecipients] = await Promise.all([
      read(`${W}infrastructure/drizzle-company-expense-reminder.repository.ts`),
      read(`${A}infrastructure/drizzle-expense-reminders.repository.ts`),
      read(`${A}infrastructure/drizzle-expense-reminders.repository.ts`),
      read(`${A}infrastructure/drizzle-expense-reminder-recipients.repository.ts`),
    ])
    expect(worker).toContain('on conflict (occurrence_id, recipient_user_id, day, kind) do nothing')
    expect(apiSent).toContain('companyExpenseRemindersSent.occurrenceId')
    expect(apiSent).toContain('companyExpenseRemindersSent.recipientUserId')
    expect(apiSent).toContain('companyExpenseRemindersSent.day')
    expect(apiSent).toContain('companyExpenseRemindersSent.kind')
    expect(worker).toContain("o.status = 'open'")
    expect(apiOccurrences).toContain("eq(companyExpenseOccurrences.status, 'open')")
    expect(worker).toContain("r.role = 'company-admin'")
    expect(apiRecipients).toContain("const ADMIN_ROLE = 'company-admin'")
    expect(worker).toContain("u.status = 'active'")
    expect(apiRecipients).toContain("eq(identityUsers.status, 'active')")
    expect(worker).toContain("m.status = 'active'")
    expect(apiRecipients).toContain("eq(userCompanyMemberships.status, 'active')")
  })
})
