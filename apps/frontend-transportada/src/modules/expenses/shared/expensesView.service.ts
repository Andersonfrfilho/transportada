/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  compareScaledAmounts,
  maskTypedAmount,
  parseTypedAmount,
  sumScaledAmounts,
  toTypedAmount,
  TYPED_MONEY_SCALE,
} from '@/modules/shared/decimalAmount.service'

import type {
  ExpenseDriverPaymentModel,
  ExpenseKind,
  ExpenseOccurrenceListItem,
  ExpenseRecurrence,
} from './expenses.types'

const MONTHS_BACK = 6
const MONTHS_AHEAD = 6
const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/

/** `yyyy-mm` e `yyyy-mm-dd` de hoje no fuso do navegador: a conta vence em data civil, sem hora. */
export function currentCompetence(now: Date = new Date()): string {
  return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function todayCivilDate(now: Date = new Date()): string {
  return `${currentCompetence(now)}-${String(now.getDate()).padStart(2, '0')}`
}

/** Meses do seletor: seis para trás e seis para frente do mês corrente. */
export function listCompetenceOptions(
  now: Date = new Date(),
): readonly Readonly<{ label: string; value: string }>[] {
  const formatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
  const options: { label: string; value: string }[] = []
  for (let offset = -MONTHS_BACK; offset <= MONTHS_AHEAD; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const label = formatter.format(date)
    options.push({
      label: label.charAt(0).toUpperCase() + label.slice(1),
      value: currentCompetence(date),
    })
  }
  return options
}

/** `2026-11-05` → `05/11/2026`, sem passar por `Date` (fuso não muda dia civil). */
export function formatCivilDate(value: string): string {
  const [year, month, day] = value.split('-')
  return year === undefined || month === undefined || day === undefined
    ? value
    : `${day}/${month}/${year}`
}

/** Vencida é aberta com vencimento anterior a hoje; paga e cancelada nunca vencem. */
export function isOverdue(
  occurrence: Pick<ExpenseOccurrenceListItem, 'dueDate' | 'status'>,
  today: string,
): boolean {
  return occurrence.status === 'open' && occurrence.dueDate < today
}

export type ExpenseSummary = Readonly<{
  expected: string
  open: string
  overdueAmount: string
  overdueCount: number
  paid: string
}>

/** Previsto e pago vêm dos `totals` da API; "em aberto" e "vencidas" saem das linhas visíveis. */
export function summarizeOccurrences(input: {
  readonly items: readonly ExpenseOccurrenceListItem[]
  readonly today: string
  readonly totals: Readonly<{ expectedAmount: string; paidAmount: string }>
}): ExpenseSummary {
  const open = input.items.filter((item) => item.status === 'open')
  const overdue = open.filter((item) => isOverdue(item, input.today))
  return {
    expected: input.totals.expectedAmount,
    open: sumScaledAmounts(open.map((item) => item.expectedAmount)),
    overdueAmount: sumScaledAmounts(overdue.map((item) => item.expectedAmount)),
    overdueCount: overdue.length,
    paid: input.totals.paidAmount,
  }
}

export type PayeeLabelKey = 'aggregate' | 'driver'

/** Rótulo derivado do cadastro na hora da leitura; ajudante entra com a T1.4c (API). */
export function resolvePayeeLabelKey(
  paymentModel: ExpenseDriverPaymentModel | null,
): PayeeLabelKey | null {
  if (paymentModel === null) return null
  return paymentModel === 'route_table' ? 'aggregate' : 'driver'
}

export function maskMoney(value: string): string {
  return maskTypedAmount({ scale: TYPED_MONEY_SCALE, value })
}

/** Texto digitado em pt-BR → texto decimal da API (`"8.500,00"` → `"8500.00"`); inválido é `null`. */
export function parseMoney(typed: string): null | string {
  if (typed === '') return null
  const parsed = parseTypedAmount({ scale: TYPED_MONEY_SCALE, value: typed })
  return MONEY_PATTERN.test(parsed) && compareScaledAmounts(parsed, '0') > 0 ? parsed : null
}

export function toTypedMoney(amount: string): string {
  return toTypedAmount({ scale: TYPED_MONEY_SCALE, value: amount })
}

/** Fixa quinzenal vence nos dias 15 e último: não pede dia. */
export function recurrenceNeedsDueDay(recurrence: ExpenseRecurrence): boolean {
  return recurrence !== 'fortnightly'
}

export type CreateFormFields = Readonly<{
  amount: string
  categoryId: string
  dueDate: string
  dueDay: string
  kind: ExpenseKind
  name: string
  payeeDriverId: string
  recurrence: ExpenseRecurrence
  vehicleId: string
}>

export const EMPTY_CREATE_FORM: CreateFormFields = {
  amount: '',
  categoryId: '',
  dueDate: '',
  dueDay: '',
  kind: 'fixed',
  name: '',
  payeeDriverId: '',
  recurrence: 'monthly',
  vehicleId: '',
}

export type CreateFormIssue = 'amount' | 'category' | 'dueDate' | 'dueDay' | 'name' | 'payee'

/** Tudo o que falta para o botão "Salvar conta" abrir; o servidor ainda recobra cada regra. */
export function validateCreateForm(
  fields: CreateFormFields,
  input: Readonly<{ requiresDriver: boolean }>,
): readonly CreateFormIssue[] {
  const issues: CreateFormIssue[] = []
  if (fields.name.trim() === '') issues.push('name')
  if (fields.categoryId === '') issues.push('category')
  if (parseMoney(fields.amount) === null) issues.push('amount')
  if (input.requiresDriver && fields.payeeDriverId === '') issues.push('payee')
  if (fields.kind === 'variable' && fields.dueDate === '') issues.push('dueDate')
  if (fields.kind === 'fixed' && recurrenceNeedsDueDay(fields.recurrence)) {
    const day = Number(fields.dueDay)
    if (!Number.isInteger(day) || day < 1 || day > 31) issues.push('dueDay')
  }
  return issues
}
