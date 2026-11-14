/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getExpensesClient } from '../shared/expensesClient.service'
import { EXPENSES_QUERY_KEY } from '../shared/expensesQueryKey.constant'
import type {
  CreateExpenseInput,
  ExpenseCostGroup,
  ExpenseOccurrenceFilters,
  SettleOccurrenceInput,
  UpdateExpenseInput,
} from '../shared/expenses.types'

/** Spec 325 T2.1: leituras com a chave raiz `expenses`; toda escrita invalida a raiz inteira. */
export function useExpenseOccurrences(
  input: Readonly<{ enabled?: boolean; filters: ExpenseOccurrenceFilters }>,
) {
  return useQuery({
    enabled: input.enabled ?? true,
    queryFn: () => getExpensesClient().listOccurrences(input.filters),
    queryKey: [EXPENSES_QUERY_KEY, 'occurrences', input.filters],
  })
}

export function useExpenseList(input: Readonly<{ enabled?: boolean }> = {}) {
  return useQuery({
    enabled: input.enabled ?? true,
    queryFn: () => getExpensesClient().listExpenses(),
    queryKey: [EXPENSES_QUERY_KEY, 'list'],
  })
}

export function useExpenseCategories(input: Readonly<{ enabled?: boolean }> = {}) {
  return useQuery({
    enabled: input.enabled ?? true,
    queryFn: () => getExpensesClient().listCategories(),
    queryKey: [EXPENSES_QUERY_KEY, 'categories'],
  })
}

export function useExpenseOccurrenceTrips(
  input: Readonly<{ enabled?: boolean; occurrenceId: string | null }>,
) {
  return useQuery({
    enabled: (input.enabled ?? true) && input.occurrenceId !== null,
    queryFn: () => getExpensesClient().listTrips(input.occurrenceId ?? ''),
    queryKey: [EXPENSES_QUERY_KEY, 'trips', input.occurrenceId],
  })
}

export function useAvailableExpenseTrips(
  input: Readonly<{
    enabled?: boolean
    from?: string
    occurrenceId: string | null
    to?: string
  }>,
) {
  return useQuery({
    enabled: (input.enabled ?? true) && input.occurrenceId !== null,
    queryFn: () =>
      getExpensesClient().availableTrips({
        ...(input.from === undefined ? {} : { from: input.from }),
        occurrenceId: input.occurrenceId ?? '',
        ...(input.to === undefined ? {} : { to: input.to }),
      }),
    queryKey: [EXPENSES_QUERY_KEY, 'available-trips', input.occurrenceId, input.from, input.to],
  })
}

export function useExpenseMutations() {
  const queryClient = useQueryClient()
  /** A revalidação não é devolvida ao TanStack: o botão não fica preso até o cache esfriar. */
  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: [EXPENSES_QUERY_KEY] })
  }

  return {
    cancelOccurrence: useMutation({
      mutationFn: (request: Readonly<{ id: string; reason: string }>) =>
        getExpensesClient().cancelOccurrence(request),
      onSuccess: invalidate,
    }),
    createCategory: useMutation({
      mutationFn: (name: string) => getExpensesClient().createCategory(name),
      onSuccess: invalidate,
    }),
    createExpense: useMutation({
      mutationFn: (request: CreateExpenseInput) => getExpensesClient().createExpense(request),
      onSuccess: invalidate,
    }),
    includeTrip: useMutation({
      mutationFn: (request: Readonly<{ occurrenceId: string; tripId: string }>) =>
        getExpensesClient().includeTrip(request),
      onSuccess: invalidate,
    }),
    removeTrip: useMutation({
      mutationFn: (request: Readonly<{ occurrenceId: string; tripId: string }>) =>
        getExpensesClient().removeTrip(request),
      onSuccess: invalidate,
    }),
    setCategoryActive: useMutation({
      mutationFn: (request: Readonly<{ active: boolean; id: string }>) =>
        getExpensesClient().setCategoryActive(request),
      onSuccess: invalidate,
    }),
    setCategoryCostGroup: useMutation({
      mutationFn: (request: Readonly<{ costGroup: ExpenseCostGroup; id: string }>) =>
        getExpensesClient().setCategoryCostGroup(request),
      onSuccess: invalidate,
    }),
    settleOccurrence: useMutation({
      mutationFn: (request: SettleOccurrenceInput) => getExpensesClient().settleOccurrence(request),
      onSuccess: invalidate,
    }),
    updateExpense: useMutation({
      mutationFn: (request: Readonly<{ changes: UpdateExpenseInput; id: string }>) =>
        getExpensesClient().updateExpense(request),
      onSuccess: invalidate,
    }),
  }
}
