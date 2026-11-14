/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325: cadastro da conta (RF1/RF1b), edição "dali para frente" (RF5) e categorias (RF2).
 */
import { formatCents, isCivilDate, parseMoneyToCents } from '../domain/expense-money.policy.js'
import { competenceOfDate } from '../domain/expense-schedule.policy.js'
import {
  ExpenseCategoryCostGroupInvalidError,
  ExpenseCategoryNameTakenError,
  ExpenseCategoryNotFoundError,
  ExpenseDriverNotAllowedError,
  ExpenseDriverNotFoundError,
  ExpenseDriverRequiredError,
  ExpenseInvalidAmountError,
  ExpenseInvalidScheduleError,
  ExpenseNotFoundError,
} from '../domain/expense.error.js'
import type {
  CompanyExpense,
  CompanyExpenseCategory,
  ExpenseRecurrence,
  ExpensesPorts,
} from './expense.port.js'
import { generateOccurrencesForExpense } from './expense-occurrence.use-case.js'

export type CreateExpenseInput = {
  readonly categoryId: string
  readonly companyId: string
  readonly correlationId?: string
  readonly createdBy: string
  readonly dueDate?: string
  readonly dueDay?: number
  readonly expectedAmount: string
  readonly kind: 'fixed' | 'variable'
  readonly name: string
  readonly payeeDriverId?: string
  readonly recurrence?: ExpenseRecurrence
  /** `yyyy-mm-dd` civil de America/Sao_Paulo, injetado para o teste ser determinístico. */
  readonly today: string
  readonly vehicleId?: string
}

function assertAmount(value: string): string {
  const cents = parseMoneyToCents(value)
  if (cents === null) throw new ExpenseInvalidAmountError()
  return formatCents(cents)
}

function assertDueDay(dueDay: number | undefined): number {
  if (dueDay === undefined || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    throw new ExpenseInvalidScheduleError('dueDay must be between 1 and 31.')
  }
  return dueDay
}

/** RF1: fixa = recorrência (+ dia, salvo quinzenal); variável = só o vencimento. */
function resolveSchedule(input: CreateExpenseInput): {
  readonly dueDay: number | null
  readonly recurrence: ExpenseRecurrence | null
} {
  if (input.kind === 'variable') {
    if (input.recurrence !== undefined || input.dueDay !== undefined) {
      throw new ExpenseInvalidScheduleError('A variable expense has no recurrence nor dueDay.')
    }
    if (input.dueDate === undefined || !isCivilDate(input.dueDate)) {
      throw new ExpenseInvalidScheduleError('A variable expense requires dueDate (yyyy-mm-dd).')
    }
    return { dueDay: null, recurrence: null }
  }
  if (input.dueDate !== undefined) {
    throw new ExpenseInvalidScheduleError('A fixed expense has no dueDate.')
  }
  if (input.recurrence === undefined) {
    throw new ExpenseInvalidScheduleError('A fixed expense requires a recurrence.')
  }
  if (input.recurrence === 'fortnightly') return { dueDay: null, recurrence: 'fortnightly' }
  return { dueDay: assertDueDay(input.dueDay), recurrence: input.recurrence }
}

export function createCreateExpenseUseCase(ports: ExpensesPorts): {
  execute(input: CreateExpenseInput): Promise<CompanyExpense>
} {
  return {
    execute: async (input) => {
      const category = await ports.categories.findById({
        categoryId: input.categoryId,
        companyId: input.companyId,
      })
      if (category === null || !category.active) throw new ExpenseCategoryNotFoundError()
      await assertDriverRule(ports, input, category)
      const schedule = resolveSchedule(input)
      const expectedAmount = assertAmount(input.expectedAmount)
      const name = input.name.trim()
      if (name === '') throw new ExpenseInvalidScheduleError('name is required.')

      const expense = await ports.expenses.create({
        anchorCompetence: competenceOfDate(input.today),
        categoryId: input.categoryId,
        companyId: input.companyId,
        dueDay: schedule.dueDay,
        expectedAmount,
        kind: input.kind,
        name,
        payeeDriverId: input.payeeDriverId ?? null,
        recurrence: schedule.recurrence,
        vehicleId: input.vehicleId ?? null,
      })
      if (input.kind === 'variable' && input.dueDate !== undefined) {
        await ports.occurrences.insertIfAbsent({
          companyId: input.companyId,
          competence: competenceOfDate(input.dueDate),
          dueDate: input.dueDate,
          expectedAmount,
          expenseId: expense.id,
          slot: 1,
        })
      } else {
        await generateOccurrencesForExpense(ports, expense, input.today)
      }
      await ports.audit.append({
        action: 'expense.created',
        actorUserId: input.createdBy,
        companyId: input.companyId,
        correlationId: input.correlationId ?? crypto.randomUUID(),
        entityId: expense.id,
        entityType: 'company_expense',
        metadata: {
          categoryId: expense.categoryId,
          expectedAmount: expense.expectedAmount,
          kind: expense.kind,
          payeeDriverId: expense.payeeDriverId,
          recurrence: expense.recurrence,
        },
      })
      return expense
    },
  }
}

async function assertDriverRule(
  ports: ExpensesPorts,
  input: CreateExpenseInput,
  category: CompanyExpenseCategory,
): Promise<void> {
  if (!category.requiresDriver) {
    if (input.payeeDriverId !== undefined) throw new ExpenseDriverNotAllowedError()
    return
  }
  if (input.payeeDriverId === undefined) throw new ExpenseDriverRequiredError()
  const driver = await ports.drivers.findById({
    companyId: input.companyId,
    driverId: input.payeeDriverId,
  })
  if (driver === null) throw new ExpenseDriverNotFoundError()
}

export type UpdateExpenseInput = {
  readonly active?: boolean
  readonly companyId: string
  readonly correlationId?: string
  readonly dueDay?: number
  readonly expectedAmount?: string
  readonly expenseId: string
  readonly name?: string
  readonly updatedBy: string
  readonly vehicleId?: string | null
}

/** RF5: o novo valor/dia vale dali para frente; nenhuma ocorrência já gerada é tocada. */
export function createUpdateExpenseUseCase(ports: ExpensesPorts): {
  execute(input: UpdateExpenseInput): Promise<CompanyExpense>
} {
  return {
    execute: async (input) => {
      const current = await ports.expenses.findById({
        companyId: input.companyId,
        expenseId: input.expenseId,
      })
      if (current === null) throw new ExpenseNotFoundError()
      if (input.dueDay !== undefined) {
        if (current.kind !== 'fixed' || current.recurrence === 'fortnightly') {
          throw new ExpenseInvalidScheduleError('This expense has no dueDay to change.')
        }
        assertDueDay(input.dueDay)
      }
      const name = input.name?.trim()
      if (name === '') throw new ExpenseInvalidScheduleError('name is required.')
      const updated = await ports.expenses.update({
        companyId: input.companyId,
        expenseId: input.expenseId,
        ...(input.active === undefined ? {} : { active: input.active }),
        ...(input.dueDay === undefined ? {} : { dueDay: input.dueDay }),
        ...(input.expectedAmount === undefined
          ? {}
          : { expectedAmount: assertAmount(input.expectedAmount) }),
        ...(name === undefined ? {} : { name }),
        ...(input.vehicleId === undefined ? {} : { vehicleId: input.vehicleId }),
      })
      if (updated === null) throw new ExpenseNotFoundError()
      await ports.audit.append({
        action: 'expense.updated',
        actorUserId: input.updatedBy,
        companyId: input.companyId,
        correlationId: input.correlationId ?? crypto.randomUUID(),
        entityId: updated.id,
        entityType: 'company_expense',
        metadata: {
          after: snapshot(updated),
          before: snapshot(current),
        },
      })
      return updated
    },
  }
}

function snapshot(expense: CompanyExpense): Record<string, unknown> {
  return {
    active: expense.active,
    dueDay: expense.dueDay,
    expectedAmount: expense.expectedAmount,
    name: expense.name,
    vehicleId: expense.vehicleId ?? null,
  }
}

export function createListExpensesUseCase(ports: ExpensesPorts): {
  execute(input: { readonly companyId: string }): Promise<readonly CompanyExpense[]>
} {
  return { execute: ({ companyId }) => ports.expenses.list({ companyId }) }
}

/** RF2: a primeira leitura da empresa semeia as 8 categorias (a migration só semeou as já existentes). */
export function createListExpenseCategoriesUseCase(ports: ExpensesPorts): {
  execute(input: { readonly companyId: string }): Promise<readonly CompanyExpenseCategory[]>
} {
  return {
    execute: async ({ companyId }) => {
      await ports.categories.ensureSeeded({ companyId })
      return ports.categories.list({ companyId })
    },
  }
}

export function createCreateExpenseCategoryUseCase(ports: ExpensesPorts): {
  execute(input: {
    readonly companyId: string
    readonly correlationId?: string
    readonly createdBy: string
    readonly name: string
  }): Promise<CompanyExpenseCategory>
} {
  return {
    execute: async (input) => {
      const name = input.name.trim()
      if (name === '') throw new ExpenseInvalidScheduleError('name is required.')
      await ports.categories.ensureSeeded({ companyId: input.companyId })
      const created = await ports.categories.create({ companyId: input.companyId, name })
      if (created === 'name_taken') throw new ExpenseCategoryNameTakenError()
      await ports.audit.append({
        action: 'expense.category.created',
        actorUserId: input.createdBy,
        companyId: input.companyId,
        correlationId: input.correlationId ?? crypto.randomUUID(),
        entityId: created.id,
        entityType: 'company_expense_category',
        metadata: { name },
      })
      return created
    },
  }
}

/** RF2: categoria desativa em vez de apagar. */
export function createSetExpenseCategoryActiveUseCase(ports: ExpensesPorts): {
  execute(input: {
    readonly active: boolean
    readonly categoryId: string
    readonly companyId: string
    readonly correlationId?: string
    readonly updatedBy: string
  }): Promise<CompanyExpenseCategory>
} {
  return {
    execute: async (input) => {
      const updated = await ports.categories.setActive({
        active: input.active,
        categoryId: input.categoryId,
        companyId: input.companyId,
      })
      if (updated === null) throw new ExpenseCategoryNotFoundError()
      await ports.audit.append({
        action: input.active ? 'expense.category.activated' : 'expense.category.deactivated',
        actorUserId: input.updatedBy,
        companyId: input.companyId,
        correlationId: input.correlationId ?? crypto.randomUUID(),
        entityId: updated.id,
        entityType: 'company_expense_category',
        metadata: { name: updated.name },
      })
      return updated
    },
  }
}

/** Spec 325 T5.3 (RF16): a categoria muda de grupo de custo; a de motorista é sempre `in_trip` e as outras nunca. */
export function createSetExpenseCategoryCostGroupUseCase(ports: ExpensesPorts): {
  execute(input: {
    readonly categoryId: string
    readonly companyId: string
    readonly correlationId?: string
    readonly costGroup: NonNullable<CompanyExpenseCategory['costGroup']>
    readonly updatedBy: string
  }): Promise<CompanyExpenseCategory>
} {
  return {
    execute: async (input) => {
      const current = await ports.categories.findById({
        categoryId: input.categoryId,
        companyId: input.companyId,
      })
      if (current === null) throw new ExpenseCategoryNotFoundError()
      if ((input.costGroup === 'in_trip') !== current.requiresDriver) {
        throw new ExpenseCategoryCostGroupInvalidError()
      }
      const previousGroup = current.costGroup ?? 'administrative'
      const updated = await ports.categories.setCostGroup({
        categoryId: input.categoryId,
        companyId: input.companyId,
        costGroup: input.costGroup,
      })
      if (updated === null) throw new ExpenseCategoryNotFoundError()
      await ports.audit.append({
        action: 'expense.category.cost_group_changed',
        actorUserId: input.updatedBy,
        companyId: input.companyId,
        correlationId: input.correlationId ?? crypto.randomUUID(),
        entityId: updated.id,
        entityType: 'company_expense_category',
        metadata: {
          from: previousGroup,
          name: updated.name,
          to: updated.costGroup ?? input.costGroup,
        },
      })
      return updated
    },
  }
}
