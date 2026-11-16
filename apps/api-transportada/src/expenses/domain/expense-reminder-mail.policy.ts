/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T7.3: os valores e o HTML do sistema do aviso de conta a vencer e do resumo diário, e a renderização dos
 * modelos (`contas.*`). Pura. O layout é do modelo (ADR-0110: proibido layout de e-mail em código); aqui só nascem os
 * valores (texto, escapado na saída) e os três blocos de HTML do sistema, que escapam tudo o que carregam.
 */
import {
  escapeEmailHtml,
  htmlToPlainText,
  interpolateEmailHtml,
} from '@adatechnology/notification-contracts'

import {
  EXPENSE_DAILY_SUMMARY_SYSTEM_HTML_VARIABLES,
  EXPENSE_REMINDER_SYSTEM_HTML_VARIABLES,
  type ExpenseMailSystemHtmlVariable,
} from './expense-reminder-mail-template.constant.js'
import { parseMoneyToCents } from './expense-money.policy.js'
import { civilDaysBetween } from './expense-reminder.policy.js'

const PLACEHOLDER_REGEX = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/gu
const WHITESPACE_RUN = /\s+/gu
const SUBJECT_MAX_LENGTH = 200
const EMPTY_FIELD = '—'

/** `'2026-11-17'` → `'17/11/2026'`. */
export function formatCivilDateBr(value: string): string {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

/** `'2026-11'` → `'11/2026'`. */
export function formatCompetenceBr(value: string): string {
  const [year, month] = value.split('-')
  return `${month}/${year}`
}

/** `'1234.5'` → `'R$ 1.234,50'`. Dinheiro em texto, nunca float. */
export function formatBrl(amount: string): string {
  const cents = parseMoneyToCents(amount)
  if (cents === null) throw new Error(`valor inválido: ${amount}`)
  const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/gu, '.')
  return `R$ ${whole},${(cents % 100n).toString().padStart(2, '0')}`
}

/** A frase do prazo, do jeito que o aviso diz. */
export function describeDueSituation(daysUntilDue: number): string {
  if (daysUntilDue > 1) return `vence em ${daysUntilDue} dias`
  if (daysUntilDue === 1) return 'vence amanhã'
  if (daysUntilDue === 0) return 'vence hoje'
  if (daysUntilDue === -1) return 'venceu ontem'
  return `venceu há ${-daysUntilDue} dias`
}

export type ExpenseReminderMailFacts = {
  readonly amount: string
  readonly categoryName: string
  readonly competence: string
  readonly companyDisplayName: string
  readonly dueDate: string
  readonly expenseName: string
  readonly payeeName: string | null
  readonly recipientName: string
  readonly today: string
}

/** RF25: os valores de texto do aviso de uma conta (e-mail e WhatsApp usam os mesmos). */
export function buildExpenseReminderValues(
  facts: ExpenseReminderMailFacts,
): Readonly<Record<string, string>> {
  return {
    categoria: facts.categoryName,
    competencia: formatCompetenceBr(facts.competence),
    conta: facts.expenseName,
    favorecido: facts.payeeName ?? EMPTY_FIELD,
    responsavel: facts.recipientName,
    situacao: describeDueSituation(civilDaysBetween(facts.today, facts.dueDate)),
    transportadora: facts.companyDisplayName,
    valor: formatBrl(facts.amount),
    vencimento: formatCivilDateBr(facts.dueDate),
  }
}

export type ExpenseSummaryLine = {
  readonly amount: string
  readonly dueDate: string
  readonly expenseName: string
}

/** RF27: os valores de texto do resumo diário. */
export function buildExpenseDailySummaryValues(input: {
  readonly companyDisplayName: string
  readonly lines: readonly ExpenseSummaryLine[]
  readonly recipientName: string
  readonly today: string
}): Readonly<Record<string, string>> {
  const total = input.lines.reduce((sum, line) => sum + (parseMoneyToCents(line.amount) ?? 0n), 0n)
  const count = input.lines.length
  return {
    dia: formatCivilDateBr(input.today),
    quantidade: `${count} ${count === 1 ? 'conta' : 'contas'}`,
    responsavel: input.recipientName,
    totalAberto: formatBrl(`${total / 100n}.${(total % 100n).toString().padStart(2, '0')}`),
    transportadora: input.companyDisplayName,
  }
}

/** Um botão "à prova de Outlook" (tabela, sem CSS moderno). Sem URL, nada: a variável sai vazia. */
export function buildExpenseMailButtonHtml(input: {
  readonly label: string
  readonly primary: boolean
  readonly url: string | null
}): string {
  if (input.url === null || !/^https:\/\//u.test(input.url)) return ''
  const background = input.primary ? '#d58a47' : '#ffffff'
  const color = '#10222c'
  const border = input.primary ? '#d58a47' : '#10222c'
  return [
    '<tr><td style="padding:8px 28px">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>',
    `<td style="background:${background};border:1px solid ${border};padding:12px 22px;">`,
    `<a href="${escapeEmailHtml(input.url)}" style="color:${color};font-size:15px;font-weight:bold;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">${escapeEmailHtml(input.label)}</a>`,
    '</td></tr></table>',
    '</td></tr>',
  ].join('')
}

/** RF27: a tabela do resumo, uma linha por conta, na ordem recebida. */
export function buildExpenseSummaryTableHtml(input: {
  readonly lines: readonly ExpenseSummaryLine[]
  readonly today: string
}): string {
  const rows = input.lines.map((line, index) => {
    const border = index === 0 ? '' : 'border-top:1px solid #e6e1d8;'
    const situation = describeDueSituation(civilDaysBetween(input.today, line.dueDate))
    return [
      '<tr>',
      `<td style="padding:10px 14px;${border}font-weight:bold;">${escapeEmailHtml(line.expenseName)}</td>`,
      `<td style="padding:10px 14px;${border}color:#6b7c85;">${escapeEmailHtml(`${formatCivilDateBr(line.dueDate)} · ${situation}`)}</td>`,
      `<td style="padding:10px 14px;${border}text-align:right;white-space:nowrap;">${escapeEmailHtml(formatBrl(line.amount))}</td>`,
      '</tr>',
    ].join('')
  })
  return [
    '<tr><td style="padding:8px 28px">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e6e1d8;font-size:14px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;color:#10222c;">',
    ...rows,
    '</table>',
    '</td></tr>',
  ].join('')
}

export type RenderedExpenseMail = {
  readonly html: string
  readonly subject: string
  readonly text: string
}

function interpolateSubject(subject: string, values: Readonly<Record<string, string>>): string {
  return subject
    .replace(PLACEHOLDER_REGEX, (_match, name: string) =>
      Object.hasOwn(values, name) ? (values[name] ?? '') : '',
    )
    .replace(WHITESPACE_RUN, ' ')
    .trim()
    .slice(0, SUBJECT_MAX_LENGTH)
}

function renderMail(input: {
  readonly body: string
  readonly subject: string
  readonly systemHtml: Readonly<Partial<Record<ExpenseMailSystemHtmlVariable, string>>>
  readonly systemHtmlNames: readonly string[]
  readonly values: Readonly<Record<string, string>>
}): RenderedExpenseMail {
  const html = interpolateEmailHtml({
    systemHtml: input.systemHtml as Readonly<Record<string, string>>,
    systemHtmlNames: input.systemHtmlNames,
    template: input.body,
    values: input.values,
  })
  return {
    html,
    subject: interpolateSubject(input.subject, input.values),
    text: htmlToPlainText(html),
  }
}

/** O e-mail do aviso (`contas.aviso-vencimento`): valor escapado; só `botaoJaPaguei`/`botaoAbrirContas` entram crus. */
export function renderExpenseReminderMail(input: {
  readonly systemHtml: Readonly<
    Partial<Record<(typeof EXPENSE_REMINDER_SYSTEM_HTML_VARIABLES)[number], string>>
  >
  readonly template: { readonly body: string; readonly subject: string }
  readonly values: Readonly<Record<string, string>>
}): RenderedExpenseMail {
  return renderMail({
    ...input.template,
    systemHtml: input.systemHtml,
    systemHtmlNames: EXPENSE_REMINDER_SYSTEM_HTML_VARIABLES,
    values: input.values,
  })
}

/** O e-mail do resumo (`contas.resumo-diario`). */
export function renderExpenseDailySummaryMail(input: {
  readonly systemHtml: Readonly<
    Partial<Record<(typeof EXPENSE_DAILY_SUMMARY_SYSTEM_HTML_VARIABLES)[number], string>>
  >
  readonly template: { readonly body: string; readonly subject: string }
  readonly values: Readonly<Record<string, string>>
}): RenderedExpenseMail {
  return renderMail({
    ...input.template,
    systemHtml: input.systemHtml,
    systemHtmlNames: EXPENSE_DAILY_SUMMARY_SYSTEM_HTML_VARIABLES,
    values: input.values,
  })
}

/** O texto do WhatsApp: sem HTML, valor cru (o WhatsApp não interpreta marcação de HTML). Uma passada só. */
export function renderExpenseWhatsappText(input: {
  readonly body: string
  readonly values: Readonly<Record<string, string>>
}): string {
  return input.body
    .replace(PLACEHOLDER_REGEX, (_match, name: string) =>
      Object.hasOwn(input.values, name) ? (input.values[name] ?? '') : '',
    )
    .trim()
}
