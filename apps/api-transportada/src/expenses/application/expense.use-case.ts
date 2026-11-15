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
  ExpenseAmountChange,
  ExpensePerson,
  ExpenseRecurrence,
  ExpensesPorts,
} from './expense.port.js'
import { generateOccurrencesForExpense } from './expense-occurrence.use-case.js'

export type CreateExpenseInput = {
  /** Spec 326: por onde a conta foi lançada; vai à trilha de auditoria. Sem ele, o painel. */
  readonly channel?: 'panel' | 'whatsapp'
  /** Spec 328: quem causou a conta (opcional; qualquer ficha da frota da empresa, inclusive ajudante). */
  readonly billLocation?: string
  /** Spec 329: link de onde se pega o boleto (http/https). */
  readonly billUrl?: string
  readonly causedByDriverId?: string
  readonly causedByName?: string
  readonly causedByUserId?: string
  readonly categoryId: string
  readonly companyId: string
  readonly correlationId?: string
  readonly createdBy: string
  readonly dueDate?: string
  readonly dueDay?: number
  readonly expectedAmount: string
  /** Extensão "parcelas": total de parcelas da conta fixa (2 a 600); o valor informado é o de cada parcela. */
  readonly installmentsTotal?: number
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

/** Parcela é da conta fixa (a variável é um vencimento só): total inteiro de 2 a 600, ou nenhum. */
function resolveInstallmentsTotal(input: CreateExpenseInput): number | null {
  if (input.installmentsTotal === undefined) return null
  const total = input.installmentsTotal
  if (input.kind !== 'fixed' || !Number.isInteger(total) || total < 2 || total > 600) {
    throw new ExpenseInvalidScheduleError(
      'installmentsTotal must be an integer from 2 to 600 and only applies to a fixed expense.',
    )
  }
  return total
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
      await assertCause(ports, input)
      const schedule = resolveSchedule(input)
      const installmentsTotal = resolveInstallmentsTotal(input)
      const expectedAmount = assertAmount(input.expectedAmount)
      const name = input.name.trim()
      if (name === '') throw new ExpenseInvalidScheduleError('name is required.')

      const expense = await ports.expenses.create({
        anchorCompetence: competenceOfDate(input.today),
        billLocation: normalizeBillLocation(input.billLocation),
        billUrl: normalizeBillUrl(input.billUrl),
        causedByDriverId: input.causedByDriverId ?? null,
        causedByName: normalizeName(input.causedByName),
        causedByUserId: input.causedByUserId ?? null,
        categoryId: input.categoryId,
        companyId: input.companyId,
        dueDay: schedule.dueDay,
        expectedAmount,
        installmentsTotal,
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
          billLocation: expense.billLocation ?? null,
          billUrl: expense.billUrl ?? null,
          causedByDriverId: expense.causedByDriverId ?? null,
          causedByName: expense.causedByName ?? null,
          causedByUserId: expense.causedByUserId ?? null,
          channel: input.channel ?? 'panel',
          expectedAmount: expense.expectedAmount,
          installmentsTotal: expense.installmentsTotal ?? null,
          kind: expense.kind,
          payeeDriverId: expense.payeeDriverId,
          recurrence: expense.recurrence,
        },
      })
      return expense
    },
  }
}

/** Spec 328: "onde a conta está" é texto livre; vazio é "não informado". */
function normalizeName(value: string | null | undefined): string | null {
  return normalizeBillLocation(value)
}

/** Spec 329: o link do boleto é http(s) e cabe em 500; vazio é "não informado". */
function normalizeBillUrl(value: string | null | undefined): string | null {
  const text = value?.trim() ?? ''
  if (text === '') return null
  let parsed: URL
  try {
    parsed = new URL(text)
  } catch {
    throw new ExpenseInvalidScheduleError('billUrl must be a valid http(s) link.')
  }
  if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || text.length > 500) {
    throw new ExpenseInvalidScheduleError('billUrl must be a valid http(s) link.')
  }
  return text
}

function normalizeBillLocation(value: string | null | undefined): string | null {
  const text = value?.trim() ?? ''
  return text === '' ? null : text
}

/**
 * Spec 328: quem causou é uma ficha da frota **ou** um usuário do escritório, nunca os dois. Na troca, informar um lado
 * limpa o outro (só informar o mesmo lado com `null` limpa a escolha).
 */
function causeChanges(input: {
  readonly causedByDriverId?: string | null
  readonly causedByName?: string | null
  readonly causedByUserId?: string | null
}): {
  causedByDriverId?: string | null
  causedByName?: string | null
  causedByUserId?: string | null
} {
  const driver = input.causedByDriverId
  const user = input.causedByUserId
  const name = input.causedByName === undefined ? undefined : normalizeName(input.causedByName)
  const chosen = [driver, user, name].some((value) => typeof value === 'string')
  return {
    ...(driver === undefined && !chosen ? {} : { causedByDriverId: driver ?? null }),
    ...(user === undefined && !chosen ? {} : { causedByUserId: user ?? null }),
    ...(name === undefined && !chosen ? {} : { causedByName: name ?? null }),
  }
}

/** Spec 328: ficha da frota da empresa ou usuário com vínculo ativo; de outra empresa ou inexistente, recusa. */
async function assertCause(
  ports: ExpensesPorts,
  input: {
    readonly causedByDriverId?: string | null
    readonly causedByName?: string | null
    readonly causedByUserId?: string | null
    readonly companyId: string
  },
): Promise<void> {
  const { causedByDriverId: driverId, causedByUserId: userId, companyId } = input
  const named = normalizeName(input.causedByName) !== null
  const chosen = [typeof driverId === 'string', typeof userId === 'string', named]
  if (chosen.filter(Boolean).length > 1) {
    throw new ExpenseInvalidScheduleError('caused by a driver, a user or a typed name: only one.')
  }
  if (typeof driverId === 'string') {
    const driver = await ports.drivers.findById({ companyId, driverId })
    if (driver === null) throw new ExpenseDriverNotFoundError()
  }
  if (typeof userId === 'string' && !(await ports.people.isActiveMember({ companyId, userId }))) {
    throw new ExpenseDriverNotFoundError()
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
  /** Spec 328: `null` limpa. */
  readonly billLocation?: string | null
  /** Spec 329: `null` limpa. */
  readonly billUrl?: string | null
  readonly causedByDriverId?: string | null
  readonly causedByUserId?: string | null
  readonly companyId: string
  readonly correlationId?: string
  readonly dueDay?: number
  /** Spec 329: `yyyy-mm` da primeira competência com o `expectedAmount` novo; sem ele, a do mês de `today`. */
  readonly effectiveFrom?: string
  /** Spec 329: `correction` troca um valor digitado errado (vale também para a conta vencida e não paga); padrão `adjustment`. */
  readonly amountKind?: 'adjustment' | 'correction'
  /** Competência da conta que está sendo corrigida (obrigatória com `amountKind: 'correction'`). */
  readonly correctionCompetence?: string
  readonly expectedAmount?: string
  readonly expenseId: string
  readonly name?: string
  readonly today?: string
  readonly updatedBy: string
  readonly vehicleId?: string | null
}

/**
 * RF5 + spec 329: valor novo nunca sobrescreve o antigo. Vira uma linha do histórico com a competência de início; só as
 * ocorrências abertas e ainda a vencer dessa competência em diante mudam (paga, cancelada ou vencida fica como estava).
 */
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
      await assertCause(ports, input)
      const amountChange = await resolveAmountChange(ports, current, input)
      const updated = await ports.expenses.update({
        companyId: input.companyId,
        expenseId: input.expenseId,
        ...(input.active === undefined ? {} : { active: input.active }),
        ...(input.billLocation === undefined
          ? {}
          : { billLocation: normalizeBillLocation(input.billLocation) }),
        ...(input.billUrl === undefined ? {} : { billUrl: normalizeBillUrl(input.billUrl) }),
        ...causeChanges(input),
        ...(input.dueDay === undefined ? {} : { dueDay: input.dueDay }),
        ...(name === undefined ? {} : { name }),
        ...(input.vehicleId === undefined ? {} : { vehicleId: input.vehicleId }),
      })
      if (updated === null) throw new ExpenseNotFoundError()
      if (amountChange !== null) {
        const change = await ports.amountChanges.append({
          changedByUserId: input.updatedBy,
          companyId: input.companyId,
          effectiveCompetence: amountChange.effectiveCompetence,
          expenseId: input.expenseId,
          kind: amountChange.kind,
          newAmount: amountChange.newAmount,
          previousAmount: amountChange.previousAmount,
        })
        const applied = await ports.occurrences.applyAmountFrom({
          amount: amountChange.newAmount,
          companyId: input.companyId,
          expenseId: input.expenseId,
          fromCompetence: amountChange.effectiveCompetence,
          onlyNotDue: amountChange.onlyNotDue,
          today: amountChange.today,
          untilCompetence: amountChange.untilCompetence,
        })
        await ports.audit.append({
          action: 'expense.amount.changed',
          actorUserId: input.updatedBy,
          companyId: input.companyId,
          correlationId: input.correlationId ?? crypto.randomUUID(),
          entityId: updated.id,
          entityType: 'company_expense',
          metadata: {
            appliedToOccurrences: applied,
            changeId: change.id,
            effectiveCompetence: change.effectiveCompetence,
            kind: change.kind,
            newAmount: change.newAmount,
            previousAmount: change.previousAmount,
          },
        })
      }
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

type ResolvedAmountChange = {
  readonly effectiveCompetence: string
  readonly kind: 'adjustment' | 'correction'
  readonly onlyNotDue: boolean
  readonly untilCompetence: string | null
  readonly newAmount: string
  readonly previousAmount: string
  readonly today: string
}

/** Valor em vigor numa competência: o da última mudança com início até ela; sem nenhuma, o de abertura. */
export function amountInEffect(
  expense: CompanyExpense,
  changes: readonly ExpenseAmountChange[],
  competence: string,
): string {
  let amount = expense.expectedAmount
  for (const change of changes) {
    if (change.effectiveCompetence <= competence) amount = change.newAmount
  }
  return amount
}

function assertCompetence(value: string, field: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(value)) {
    throw new ExpenseInvalidScheduleError(`${field} must be yyyy-mm.`)
  }
}

async function resolveAmountChange(
  ports: ExpensesPorts,
  current: CompanyExpense,
  input: UpdateExpenseInput,
): Promise<ResolvedAmountChange | null> {
  if (input.expectedAmount === undefined) return null
  const newAmount = assertAmount(input.expectedAmount)
  const today = input.today ?? new Date().toISOString().slice(0, 10)
  const changes = await ports.amountChanges.list({
    companyId: input.companyId,
    expenseId: input.expenseId,
  })
  if (input.amountKind === 'correction') {
    // Valor digitado errado: troca o trecho de valor em que a competência está (do começo dele até a próxima mudança).
    const competence = input.correctionCompetence ?? ''
    assertCompetence(competence, 'correctionCompetence')
    const starts = changes.map((c) => c.effectiveCompetence)
    const segmentStart =
      starts
        .filter((s) => s <= competence)
        .sort()
        .at(-1) ?? '0000-01'
    const segmentEnd =
      starts
        .filter((s) => s > competence)
        .sort()
        .at(0) ?? null
    const previousAmount = amountInEffect(current, changes, competence)
    if (previousAmount === newAmount) return null
    return {
      effectiveCompetence: segmentStart,
      kind: 'correction',
      newAmount,
      onlyNotDue: false,
      previousAmount,
      today,
      untilCompetence: segmentEnd,
    }
  }
  const effectiveCompetence = input.effectiveFrom ?? competenceOfDate(today)
  assertCompetence(effectiveCompetence, 'effectiveFrom')
  const previousAmount = amountInEffect(current, changes, effectiveCompetence)
  if (previousAmount === newAmount) return null
  return {
    effectiveCompetence,
    kind: 'adjustment',
    newAmount,
    onlyNotDue: true,
    previousAmount,
    today,
    untilCompetence: null,
  }
}

export function createListExpenseAmountHistoryUseCase(ports: ExpensesPorts): {
  execute(input: {
    readonly companyId: string
    readonly expenseId: string
  }): Promise<{ readonly baseAmount: string; readonly changes: readonly ExpenseAmountChange[] }>
} {
  return {
    execute: async ({ companyId, expenseId }) => {
      const expense = await ports.expenses.findById({ companyId, expenseId })
      if (expense === null) throw new ExpenseNotFoundError()
      return {
        baseAmount: expense.expectedAmount,
        changes: await ports.amountChanges.list({ companyId, expenseId }),
      }
    },
  }
}

function snapshot(expense: CompanyExpense): Record<string, unknown> {
  return {
    active: expense.active,
    billLocation: expense.billLocation ?? null,
    billUrl: expense.billUrl ?? null,
    causedByDriverId: expense.causedByDriverId ?? null,
    causedByName: expense.causedByName ?? null,
    causedByUserId: expense.causedByUserId ?? null,
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

/** Spec 328: as pessoas que a tela oferece em "quem causou" (frota ativa + usuários do escritório). */
export function createListExpensePeopleUseCase(ports: ExpensesPorts): {
  execute(input: { readonly companyId: string }): Promise<readonly ExpensePerson[]>
} {
  return { execute: ({ companyId }) => ports.people.list({ companyId }) }
}
