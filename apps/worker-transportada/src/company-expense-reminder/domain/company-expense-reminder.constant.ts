/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T7.4: o nome da rotina, as chaves dos modelos e os nomes do HTML do sistema dos avisos de conta a vencer.
 * ⚠️ Cópia por valor das constantes de `api-transportada/src/expenses/domain/expense-reminder-mail-template.constant.ts`
 * (paridade em `test/company-expense-reminder/parity.contract.ts`).
 */
export const COMPANY_EXPENSE_REMINDER_SEND_JOB = 'company-expense.reminder.send' as const

export const EXPENSE_REMINDER_TEMPLATE_KEY = 'contas.aviso-vencimento'
export const EXPENSE_DAILY_SUMMARY_TEMPLATE_KEY = 'contas.resumo-diario'

/** O fuso civil das contas (RF1): vencimento é data de America/Sao_Paulo. */
export const COMPANY_EXPENSE_TIME_ZONE = 'America/Sao_Paulo'

export const EXPENSE_REMINDER_SYSTEM_HTML_VARIABLES = ['botaoJaPaguei', 'botaoAbrirContas'] as const

export const EXPENSE_DAILY_SUMMARY_SYSTEM_HTML_VARIABLES = [
  'tabelaContas',
  'botaoAbrirContas',
] as const

export type ExpenseMailSystemHtmlVariable =
  | (typeof EXPENSE_DAILY_SUMMARY_SYSTEM_HTML_VARIABLES)[number]
  | (typeof EXPENSE_REMINDER_SYSTEM_HTML_VARIABLES)[number]
