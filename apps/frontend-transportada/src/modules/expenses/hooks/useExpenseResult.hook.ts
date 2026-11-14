/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getExpensesClient } from '../shared/expensesClient.service'
import { EXPENSES_QUERY_KEY } from '../shared/expensesQueryKey.constant'
import type {
  ExpenseAllocationSettings,
  ExpenseExportFormat,
  ExpenseResultQuery,
} from '../shared/expensesResult.types'

/**
 * Spec 325 T5.1: leituras do resultado sob a raiz `expenses` (baixar ou cancelar uma conta renova o resultado
 * junto). O resultado é um cálculo na leitura (ADR-0116): nada para gravar, só ler de novo.
 */
export function useExpenseResult(
  input: Readonly<{ enabled?: boolean; query: ExpenseResultQuery }>,
) {
  return useQuery({
    enabled: input.enabled ?? true,
    queryFn: () => getExpensesClient().getResult(input.query),
    queryKey: [EXPENSES_QUERY_KEY, 'result', input.query],
  })
}

export function useExpenseUnitCosts(
  input: Readonly<{ enabled?: boolean; query: ExpenseResultQuery }>,
) {
  /** O custo por km não tem filtro (RF17): só o período entra na chave e na chamada. */
  const { from, to } = input.query
  return useQuery({
    enabled: input.enabled ?? true,
    queryFn: () => getExpensesClient().getUnitCosts({ from, to }),
    queryKey: [EXPENSES_QUERY_KEY, 'unit-costs', from, to],
  })
}

export function useExpenseAllocationSettings(input: Readonly<{ enabled?: boolean }> = {}) {
  return useQuery({
    enabled: input.enabled ?? true,
    queryFn: () => getExpensesClient().getAllocationSettings(),
    queryKey: [EXPENSES_QUERY_KEY, 'allocation-settings'],
  })
}

export function useExpenseOutOfPatternThreshold(input: Readonly<{ enabled?: boolean }> = {}) {
  return useQuery({
    enabled: input.enabled ?? true,
    queryFn: () => getExpensesClient().getOutOfPatternThreshold(),
    queryKey: [EXPENSES_QUERY_KEY, 'out-of-pattern-threshold'],
  })
}

export function useExpenseResultMutations() {
  const queryClient = useQueryClient()

  return {
    /** Trocar o critério muda o rateio: a raiz inteira é renovada (resultado e custo por km). */
    updateAllocationSettings: useMutation({
      mutationFn: (settings: Partial<ExpenseAllocationSettings>) =>
        getExpensesClient().updateAllocationSettings(settings),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: [EXPENSES_QUERY_KEY] })
      },
    }),
    /** O limite do fora do padrão só muda o alerta da previsão: a raiz é renovada igual. */
    updateOutOfPatternThreshold: useMutation({
      mutationFn: (thresholdPercent: number) =>
        getExpensesClient().updateOutOfPatternThreshold(thresholdPercent),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: [EXPENSES_QUERY_KEY] })
      },
    }),
    /** Exportar não muda dado nenhum: devolve o arquivo e a tela decide como baixar. */
    exportResult: useMutation({
      mutationFn: (request: ExpenseResultQuery & Readonly<{ format: ExpenseExportFormat }>) =>
        getExpensesClient().exportResult(request),
    }),
  }
}
