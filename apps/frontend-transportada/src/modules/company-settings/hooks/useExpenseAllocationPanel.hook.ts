/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import {
  useExpenseCategories,
  useExpenseMutations,
} from '@/modules/expenses/hooks/useExpenses.hook'
import {
  useExpenseAllocationSettings,
  useExpenseOutOfPatternThreshold,
  useExpenseResultMutations,
} from '@/modules/expenses/hooks/useExpenseResult.hook'
import type { ExpenseCostGroup } from '@/modules/expenses/shared/expenses.types'
import type {
  ExpenseAllocatableGroup,
  ExpenseAllocationCriterion,
} from '@/modules/expenses/shared/expensesResult.types'

import {
  EMPTY_EXPENSE_ALLOCATION_DRAFT,
  diffAllocationDraft,
  hasAllocationChanges,
  parseThresholdPercent,
  type ExpenseAllocationDraft,
} from '../shared/expenseAllocationForm.service'

/** Três leituras (categorias, critérios e limite) e uma gravação só: o Salvar manda o que mudou e relê tudo. */
export function useExpenseAllocationPanel(input: Readonly<{ canRead: boolean }>) {
  const categoriesQuery = useExpenseCategories({ enabled: input.canRead })
  const settingsQuery = useExpenseAllocationSettings({ enabled: input.canRead })
  const thresholdQuery = useExpenseOutOfPatternThreshold({ enabled: input.canRead })
  const { setCategoryCostGroup } = useExpenseMutations()
  const { updateAllocationSettings, updateOutOfPatternThreshold } = useExpenseResultMutations()
  const [draft, setDraft] = useState<ExpenseAllocationDraft>(EMPTY_EXPENSE_ALLOCATION_DRAFT)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [saved, setSaved] = useState(false)

  const categories = categoriesQuery.data
  const storedCriteria = settingsQuery.data
  const storedThreshold = thresholdQuery.data
  const ready =
    categories !== undefined && storedCriteria !== undefined && storedThreshold !== undefined
  const thresholdText = draft.threshold
  const thresholdInvalid = thresholdText !== null && parseThresholdPercent(thresholdText) === null
  const changes = ready
    ? diffAllocationDraft({ categories, draft, storedCriteria, storedThreshold })
    : null

  function touch(next: ExpenseAllocationDraft): void {
    setDraft(next)
    setSaved(false)
    setFailed(false)
  }

  async function save(): Promise<void> {
    if (changes === null || !hasAllocationChanges(changes) || thresholdInvalid) return
    setSaving(true)
    setFailed(false)
    try {
      const writes: Promise<unknown>[] = []
      if (Object.keys(changes.criteria).length > 0) {
        writes.push(updateAllocationSettings.mutateAsync(changes.criteria))
      }
      if (changes.threshold !== null) {
        writes.push(updateOutOfPatternThreshold.mutateAsync(changes.threshold))
      }
      for (const change of changes.categoryGroups) {
        writes.push(setCategoryCostGroup.mutateAsync(change))
      }
      await Promise.all(writes)
      /** As mutações já renovam a raiz `expenses`; aqui só se espera a releitura das três consultas do painel. */
      await Promise.all([
        categoriesQuery.refetch(),
        settingsQuery.refetch(),
        thresholdQuery.refetch(),
      ])
      setDraft(EMPTY_EXPENSE_ALLOCATION_DRAFT)
      setSaved(true)
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return {
    categories,
    changes,
    draft,
    failed,
    loadFailed: categoriesQuery.isError || settingsQuery.isError || thresholdQuery.isError,
    pending:
      input.canRead &&
      !ready &&
      !categoriesQuery.isError &&
      !settingsQuery.isError &&
      !thresholdQuery.isError,
    ready,
    reload: () => {
      void categoriesQuery.refetch()
      void settingsQuery.refetch()
      void thresholdQuery.refetch()
    },
    save,
    saved,
    saving,
    setCategoryGroup: (id: string, costGroup: ExpenseCostGroup) =>
      touch({ ...draft, categoryGroups: { ...draft.categoryGroups, [id]: costGroup } }),
    setCriterion: (group: ExpenseAllocatableGroup, criterion: ExpenseAllocationCriterion) =>
      touch({ ...draft, criteria: { ...draft.criteria, [group]: criterion } }),
    setThreshold: (text: string) => touch({ ...draft, threshold: text }),
    storedCriteria,
    storedThreshold,
    thresholdInvalid,
  }
}
