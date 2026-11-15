/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T7.4: a rotina é cópia por valor da regra da API (as apps não importam código uma da outra). Se a API mudar
 * uma regra e a cópia não, o aviso sai no dia errado ou para a pessoa errada.
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
  test('a regra de quando, quem e por qual canal é a mesma', async () => {
    const [worker, api] = await Promise.all([
      read(`${W}domain/expense-reminder.policy.ts`),
      read(`${A}domain/expense-reminder.policy.ts`),
    ])
    for (const marker of [
      "if (daysUntilDue === 0) return 'due_today'",
      'input.settings.daysBefore > 0 && daysUntilDue === input.settings.daysBefore',
      'return -daysUntilDue <= input.settings.maxOverdueNotices ? ',
      'return input.hourInSaoPaulo >= input.settings.dailySummaryHour',
      'return facts.whatsappOptIn && facts.hasVerifiedWhatsapp',
      "reason: input.responsible === null ? 'no_responsible' : 'responsible_unreachable'",
      "const CHANNEL_ORDER: readonly ReminderChannel[] = ['email', 'whatsapp', 'push']",
      "export const EXPENSE_REMINDER_DRIVING_ROLES = ['driver', 'aggregate'] as const",
      'facts.drivesInFleet ||',
    ]) {
      expect(api).toContain(marker)
      expect(worker).toContain(marker)
    }
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
