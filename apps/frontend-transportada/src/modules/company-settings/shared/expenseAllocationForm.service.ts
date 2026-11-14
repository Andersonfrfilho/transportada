/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  EXPENSE_ALLOCATABLE_GROUPS,
  EXPENSE_OUT_OF_PATTERN_RANGE,
  type ExpenseAllocatableGroup,
  type ExpenseAllocationCriterion,
  type ExpenseAllocationSettings,
} from '@/modules/expenses/shared/expensesResult.types'
import type { ExpenseCategory, ExpenseCostGroup } from '@/modules/expenses/shared/expenses.types'

/**
 * Spec 325 T5.3 (RF16): a conta do painel "Rateio das contas". O rascunho guarda só o que a pessoa mexeu; o que
 * ela não tocou continua lido do gravado, então uma releitura nunca é pisada por cópia velha.
 */
export type ExpenseAllocationDraft = Readonly<{
  categoryGroups: Readonly<Record<string, ExpenseCostGroup>>
  criteria: Readonly<Partial<Record<ExpenseAllocatableGroup, ExpenseAllocationCriterion>>>
  threshold: string | null
}>

export const EMPTY_EXPENSE_ALLOCATION_DRAFT: ExpenseAllocationDraft = {
  categoryGroups: {},
  criteria: {},
  threshold: null,
}

/** Os grupos que uma categoria comum pode escolher. `in_trip` é só do pagamento de motorista. */
export const EXPENSE_CATEGORY_GROUP_CHOICES: readonly ExpenseAllocatableGroup[] =
  EXPENSE_ALLOCATABLE_GROUPS

export function groupChoicesOf(category: Pick<ExpenseCategory, 'requiresDriver'>) {
  return category.requiresDriver ? (['in_trip'] as const) : EXPENSE_CATEGORY_GROUP_CHOICES
}

/** Texto digitado (vírgula ou ponto) → número com até duas casas, de 0 a 1000; `null` se não for válido. */
export function parseThresholdPercent(text: string): number | null {
  const normalized = text.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const value = Number(normalized)
  const { max, min } = EXPENSE_OUT_OF_PATTERN_RANGE
  return value >= min && value <= max ? value : null
}

export function formatThresholdPercent(value: number): string {
  return String(value).replace('.', ',')
}

export type ExpenseAllocationChanges = Readonly<{
  categoryGroups: readonly { costGroup: ExpenseCostGroup; id: string }[]
  criteria: Partial<ExpenseAllocationSettings>
  threshold: number | null
}>

/** Só o que difere do gravado vai à API; sem mudança nenhuma o botão Salvar fica desligado. */
export function diffAllocationDraft(
  input: Readonly<{
    categories: readonly ExpenseCategory[]
    draft: ExpenseAllocationDraft
    storedCriteria: ExpenseAllocationSettings
    storedThreshold: number
  }>,
): ExpenseAllocationChanges {
  const criteria: Partial<Record<ExpenseAllocatableGroup, ExpenseAllocationCriterion>> = {}
  for (const group of EXPENSE_ALLOCATABLE_GROUPS) {
    const chosen = input.draft.criteria[group]
    if (chosen !== undefined && chosen !== input.storedCriteria[group]) criteria[group] = chosen
  }
  const categoryGroups = input.categories.flatMap((category) => {
    const chosen = input.draft.categoryGroups[category.id]
    return chosen === undefined || chosen === category.costGroup
      ? []
      : [{ costGroup: chosen, id: category.id }]
  })
  const typed = input.draft.threshold === null ? null : parseThresholdPercent(input.draft.threshold)
  return {
    categoryGroups,
    criteria,
    threshold: typed !== null && typed !== input.storedThreshold ? typed : null,
  }
}

export function hasAllocationChanges(changes: ExpenseAllocationChanges): boolean {
  return (
    changes.categoryGroups.length > 0 ||
    Object.keys(changes.criteria).length > 0 ||
    changes.threshold !== null
  )
}
