/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325: ocorrências — geração (RF4), baixa (P3), cancelamento (RF6) e lista com totais (P4/CA05).
 */
import {
  competenceOfDate,
  listExpenseCompetenceWindow,
  resolveExpenseSlots,
} from '../domain/expense-schedule.policy.js'
import { formatCents, isCivilDate, parseMoneyToCents } from '../domain/expense-money.policy.js'
import {
  ExpenseInvalidPaidAmountError,
  ExpenseInvalidScheduleError,
  ExpenseOccurrenceAlreadyPaidError,
  ExpenseOccurrenceCanceledError,
  ExpenseOccurrenceNotCancelableError,
  ExpenseOccurrenceNotFoundError,
} from '../domain/expense.error.js'
import type {
  CompanyExpense,
  CompanyExpenseOccurrence,
  ExpenseOccurrenceFilters,
  ExpenseOccurrenceListItem,
  ExpensesPorts,
} from './expense.port.js'

export type SettleExpenseOccurrenceInput = {
  readonly companyId: string
  readonly correlationId?: string
  readonly occurrenceId: string
  readonly paidAmount: string
  /** `yyyy-mm-dd`. */
  readonly paidAt: string
  readonly settledBy: string
  readonly settlementNote: string | null
}

/** Gera a janela de uma conta fixa (mês do `today` + 3). Idempotente; devolve quantas ocorrências nasceram. */
export async function generateOccurrencesForExpense(
  ports: ExpensesPorts,
  expense: CompanyExpense,
  today: string,
): Promise<number> {
  if (!expense.active || expense.kind !== 'fixed' || expense.recurrence === null) return 0
  const window = listExpenseCompetenceWindow(today)
  const anchorCompetence = expense.anchorCompetence ?? window[0] ?? competenceOfDate(today)
  let created = 0
  for (const competence of window) {
    const slots = resolveExpenseSlots({
      anchorCompetence,
      competence,
      dueDay: expense.dueDay,
      recurrence: expense.recurrence,
    })
    for (const { dueDate, slot } of slots) {
      const inserted = await ports.occurrences.insertIfAbsent({
        companyId: expense.companyId,
        competence,
        dueDate,
        expectedAmount: expense.expectedAmount,
        expenseId: expense.id,
        slot,
      })
      if (inserted) created += 1
    }
  }
  return created
}

export type GenerateExpenseOccurrencesInput = {
  readonly companyId: string
  readonly today: string
}

/** Idempotente: gera o mês corrente e os 3 seguintes das contas fixas ativas. */
export function createGenerateExpenseOccurrencesUseCase(ports: ExpensesPorts): {
  execute(input: GenerateExpenseOccurrencesInput): Promise<void>
} {
  return {
    execute: async ({ companyId, today }) => {
      const expenses = await ports.expenses.listActiveFixed({ companyId })
      for (const expense of expenses) await generateOccurrencesForExpense(ports, expense, today)
    },
  }
}

export function createSettleExpenseOccurrenceUseCase(ports: ExpensesPorts): {
  execute(input: SettleExpenseOccurrenceInput): Promise<CompanyExpenseOccurrence>
} {
  return {
    execute: async (input) => {
      const cents = parseMoneyToCents(input.paidAmount)
      if (cents === null || cents <= 0n || !isCivilDate(input.paidAt)) {
        throw new ExpenseInvalidPaidAmountError()
      }
      const lookup = { companyId: input.companyId, occurrenceId: input.occurrenceId }
      const occurrence = await ports.occurrences.findById(lookup)
      if (occurrence === null) throw new ExpenseOccurrenceNotFoundError()
      assertOpen(occurrence)

      const paid = await ports.occurrences.markPaid({
        occurrenceId: input.occurrenceId,
        paidAmount: formatCents(cents),
        paidAt: input.paidAt,
        paidBy: input.settledBy,
        settlementNote: input.settlementNote,
      })
      if (paid === null) {
        // Corrida: outra baixa/cancelamento ganhou entre a leitura e a gravação.
        const current = await ports.occurrences.findById(lookup)
        if (current === null) throw new ExpenseOccurrenceNotFoundError()
        assertOpen(current)
        throw new ExpenseOccurrenceAlreadyPaidError()
      }
      await ports.audit.append({
        action: 'expense.occurrence.settled',
        actorUserId: input.settledBy,
        companyId: input.companyId,
        correlationId: input.correlationId ?? crypto.randomUUID(),
        entityId: paid.id,
        entityType: 'company_expense_occurrence',
        metadata: {
          expectedAmount: paid.expectedAmount,
          expenseId: paid.expenseId,
          paidAmount: paid.paidAmount,
          paidAt: paid.paidAt,
        },
      })
      return paid
    },
  }
}

function assertOpen(occurrence: CompanyExpenseOccurrence): void {
  if (occurrence.status === 'paid') throw new ExpenseOccurrenceAlreadyPaidError()
  if (occurrence.status === 'canceled') throw new ExpenseOccurrenceCanceledError()
}

export type CancelExpenseOccurrenceInput = {
  readonly canceledBy: string
  readonly companyId: string
  readonly correlationId?: string
  readonly occurrenceId: string
  readonly reason: string
}

/** RF6: só a ocorrência aberta cancela, com motivo. */
export function createCancelExpenseOccurrenceUseCase(ports: ExpensesPorts): {
  execute(input: CancelExpenseOccurrenceInput): Promise<CompanyExpenseOccurrence>
} {
  return {
    execute: async (input) => {
      const reason = input.reason.trim()
      if (reason === '') throw new ExpenseInvalidScheduleError('A cancellation reason is required.')
      const lookup = { companyId: input.companyId, occurrenceId: input.occurrenceId }
      const occurrence = await ports.occurrences.findById(lookup)
      if (occurrence === null) throw new ExpenseOccurrenceNotFoundError()
      if (occurrence.status !== 'open') throw new ExpenseOccurrenceNotCancelableError()

      const canceled = await ports.occurrences.cancel({
        canceledBy: input.canceledBy,
        companyId: input.companyId,
        occurrenceId: input.occurrenceId,
        reason,
      })
      if (canceled === null) throw new ExpenseOccurrenceNotCancelableError()
      await ports.audit.append({
        action: 'expense.occurrence.canceled',
        actorUserId: input.canceledBy,
        companyId: input.companyId,
        correlationId: input.correlationId ?? crypto.randomUUID(),
        entityId: canceled.id,
        entityType: 'company_expense_occurrence',
        metadata: { expenseId: canceled.expenseId, reason },
      })
      return canceled
    },
  }
}

export type ExpenseOccurrenceTotals = {
  readonly count: number
  /** Previsto das ocorrências não canceladas (CA05). */
  readonly expectedAmount: string
  /** Pago das ocorrências baixadas. */
  readonly paidAmount: string
  /** RF1c: total pago por motorista/agregado no filtro. */
  readonly paidByDriver: readonly {
    readonly driverId: string
    readonly driverName: string | null
    readonly paidAmount: string
  }[]
}

export type ListExpenseOccurrencesResult = {
  readonly items: readonly ExpenseOccurrenceListItem[]
  readonly totals: ExpenseOccurrenceTotals
}

export function createListExpenseOccurrencesUseCase(ports: ExpensesPorts): {
  execute(input: {
    readonly companyId: string
    readonly filters: ExpenseOccurrenceFilters
  }): Promise<ListExpenseOccurrencesResult>
} {
  return {
    execute: async ({ companyId, filters }) => {
      const items = await ports.occurrences.list({ companyId, filters })
      return { items, totals: sumOccurrences(items) }
    },
  }
}

export function sumOccurrences(
  items: readonly ExpenseOccurrenceListItem[],
): ExpenseOccurrenceTotals {
  let expected = 0n
  let paid = 0n
  const perDriver = new Map<string, { name: string | null; cents: bigint }>()
  for (const item of items) {
    if (item.status !== 'canceled') expected += parseMoneyToCents(item.expectedAmount) ?? 0n
    if (item.status !== 'paid') continue
    const cents = parseMoneyToCents(item.paidAmount ?? '0') ?? 0n
    paid += cents
    if (item.payeeDriverId === null) continue
    const entry = perDriver.get(item.payeeDriverId) ?? { cents: 0n, name: item.payeeDriverName }
    perDriver.set(item.payeeDriverId, { cents: entry.cents + cents, name: entry.name })
  }
  return {
    count: items.length,
    expectedAmount: formatCents(expected),
    paidAmount: formatCents(paid),
    paidByDriver: [...perDriver.entries()].map(([driverId, { cents, name }]) => ({
      driverId,
      driverName: name,
      paidAmount: formatCents(cents),
    })),
  }
}
