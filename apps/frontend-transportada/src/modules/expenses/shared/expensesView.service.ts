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
  ExpenseTripRoute,
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

export type PayeeLabelKey = 'aggregate' | 'driver' | 'helper'

/** Rótulo derivado do cadastro quando a API não traz `payeeProfile`; nunca devolve ajudante. */
export function resolvePayeeLabelKey(
  paymentModel: ExpenseDriverPaymentModel | null,
): PayeeLabelKey | null {
  if (paymentModel === null) return null
  return paymentModel === 'route_table' ? 'aggregate' : 'driver'
}

/** O perfil que a API devolve (T1.4c) vence; sem ele (API anterior), deriva do cadastro como antes. */
export function resolveOccurrencePayeeKey(
  occurrence: Pick<ExpenseOccurrenceListItem, 'payeeDriverPaymentModel' | 'payeeProfile'>,
): PayeeLabelKey | null {
  return occurrence.payeeProfile ?? resolvePayeeLabelKey(occurrence.payeeDriverPaymentModel)
}

/** "RIBEIRAO PRETO → CAMPINAS"; só o destino quando a viagem tem uma parada; `null` sem trajeto. */
export function formatTripRoute(route: ExpenseTripRoute | null | undefined): null | string {
  if (route === null || route === undefined) return null
  return route.origin === null ? route.destination : `${route.origin} → ${route.destination}`
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

/** Total de parcelas digitado: inteiro de 2 a 600; `null` quando vazio ou inválido. */
export function parseInstallmentsTotal(value: string): number | null {
  if (!/^\d{1,3}$/.test(value)) return null
  const total = Number(value)
  return total >= 2 && total <= 600 ? total : null
}

/** "3/10" na lista e na baixa; `null` quando a conta não é parcelada. */
export function formatInstallment(
  input: Readonly<{ installmentNumber: number | null; installmentsTotal: number | null }>,
): string | null {
  if (input.installmentNumber === null || input.installmentsTotal === null) return null
  return `${input.installmentNumber}/${input.installmentsTotal}`
}

export type CreateFormFields = Readonly<{
  amount: string
  /** Onde a conta está (texto livre, opcional). */
  billLocation: string
  /** Spec 329: link de onde se pega o boleto (opcional). */
  billUrl: string
  /** Spec 328: opcional; `driver:<id>` | `user:<id>`, vazio = ninguém. */
  causedBy: string
  /** Causador digitado (fora do cadastro); só vale sem `causedBy`. */
  causedByName: string
  categoryId: string
  dueDate: string
  dueDay: string
  /** Spec 330: funcionário opcional; `driver:<id>` | `user:<id>`, vazio = ninguém (ou o nome digitado). */
  employee: string
  employeeName: string
  employmentType: string
  /** Texto digitado; vazio = conta sem fim. */
  installments: string
  kind: ExpenseKind
  name: string
  payeeDriverId: string
  recurrence: ExpenseRecurrence
  /** Spec 331: tipo da categoria (qual cartão); vazio = sem tipo. */
  subtypeId: string
  vehicleId: string
}>

export const EMPTY_CREATE_FORM: CreateFormFields = {
  amount: '',
  billLocation: '',
  billUrl: '',
  causedBy: '',
  causedByName: '',
  categoryId: '',
  dueDate: '',
  dueDay: '',
  employee: '',
  employeeName: '',
  employmentType: '',
  installments: '',
  kind: 'fixed',
  name: '',
  payeeDriverId: '',
  recurrence: 'monthly',
  subtypeId: '',
  vehicleId: '',
}

export type CreateFormIssue =
  | 'amount'
  | 'billUrl'
  | 'category'
  | 'dueDate'
  | 'dueDay'
  | 'installments'
  | 'name'
  | 'payee'

/** Tudo o que falta para o botão "Salvar conta" abrir; o servidor ainda recobra cada regra. */
export function validateCreateForm(
  fields: CreateFormFields,
  input: Readonly<{ requiresDriver: boolean }>,
): readonly CreateFormIssue[] {
  const issues: CreateFormIssue[] = []
  if (fields.name.trim() === '') issues.push('name')
  if (!isValidBillUrl(fields.billUrl)) issues.push('billUrl')
  if (fields.categoryId === '') issues.push('category')
  if (parseMoney(fields.amount) === null) issues.push('amount')
  if (input.requiresDriver && fields.payeeDriverId === '') issues.push('payee')
  if (fields.kind === 'variable' && fields.dueDate === '') issues.push('dueDate')
  if (fields.kind === 'fixed' && recurrenceNeedsDueDay(fields.recurrence)) {
    const day = Number(fields.dueDay)
    if (!Number.isInteger(day) || day < 1 || day > 31) issues.push('dueDay')
    if (fields.installments !== '' && parseInstallmentsTotal(fields.installments) === null) {
      issues.push('installments')
    }
  }
  return issues
}

/** Spec 329: o link do boleto é http(s) ou vazio; o servidor recobra. */
export function isValidBillUrl(value: string): boolean {
  const text = value.trim()
  if (text === '') return true
  try {
    const parsed = new URL(text)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

/** Spec 332: a conta da própria empresa (sem pessoa) é o nome digitado fixo, filtrável como qualquer outro nome. */
export const COMPANY_OWN_PERSON_NAME = 'A própria empresa'

/** Spec 332: o valor do campo único de pessoa — escolha do cadastro (`driver:`/`user:`) ou nome digitado (`name:`). */
export const PERSON_NAME_VALUE_PREFIX = 'name:'

export function toPersonFieldValue(input: Readonly<{ choice: string; name: string }>): string {
  if (input.choice !== '') return input.choice
  return input.name.trim() === '' ? '' : `${PERSON_NAME_VALUE_PREFIX}${input.name.trim()}`
}

export function fromPersonFieldValue(value: string): { choice: string; name: string } {
  return value.startsWith(PERSON_NAME_VALUE_PREFIX)
    ? { choice: '', name: value.slice(PERSON_NAME_VALUE_PREFIX.length) }
    : { choice: value, name: '' }
}

/** Spec 330: o funcionário escolhido vira a chave certa da API (mesma convenção do causador). */
export function employeeKeys(choice: string): {
  employeeDriverId?: string
  employeeUserId?: string
} {
  if (choice.startsWith('driver:')) return { employeeDriverId: choice.slice('driver:'.length) }
  if (choice.startsWith('user:')) return { employeeUserId: choice.slice('user:'.length) }
  return {}
}

/** Spec 328: a escolha do select (`driver:<id>` | `user:<id>`) vira a chave certa da API. */
export function causedByKeys(choice: string): {
  causedByDriverId?: string
  causedByUserId?: string
} {
  if (choice.startsWith('driver:')) return { causedByDriverId: choice.slice('driver:'.length) }
  if (choice.startsWith('user:')) return { causedByUserId: choice.slice('user:'.length) }
  return {}
}
