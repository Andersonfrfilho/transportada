/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  toTripRevenueEntryBody,
  type TripRevenueEntryFormFields,
} from '../shared/tripRevenueEntryForm.service'
import type { CompanyEntryKind, TripRevenueEntry } from '../shared/tripFinancials.types'
import { getTripFinancialsClient } from '../shared/tripFinancialsClient.service'
import {
  COMPANY_ENTRY_KINDS_QUERY_KEY,
  FINANCIALS_PERMISSION,
  TRIP_MANAGE_PERMISSION,
  TRIP_REVENUE_ENTRIES_QUERY_KEY,
  TRIP_VALUATION_QUERY_KEY,
} from '../shared/tripFinancialsQueryKey.constant'

export type TripRevenueEntriesController = Readonly<{
  /** Lançar é `trip.manage`; ler é `trip.financials` — mesma regra do gasto (spec 169 RF8). */
  canRecord: boolean
  canReadEntries: boolean
  entries: readonly TripRevenueEntry[]
  entryKinds: readonly CompanyEntryKind[]
  isError: boolean
  isLoading: boolean
  isRecording: boolean
  isRemoving: boolean
  /** `false` quando a API recusou: o formulário guarda o que foi digitado em vez de limpar. */
  record: (fields: TripRevenueEntryFormFields) => Promise<boolean>
  /** Spec 169 RF12/RF13: remove sem apagar — some da lista e da soma. */
  remove: (entryId: string) => Promise<boolean>
  retry: () => void
}>

/**
 * Spec 169 P1: o que já entrou fora do frete nesta viagem, com autor, e o campo para lançar mais
 * um. Espelha `useTripCostEntries.hook.ts` — mesma trilha de permissão e invalidação.
 */
export function useTripRevenueEntries(
  input: Readonly<{ permissions: readonly string[]; tripId: string }>,
): TripRevenueEntriesController {
  const queryClient = useQueryClient()
  const canReadEntries = input.permissions.includes(FINANCIALS_PERMISSION)
  const canRecord = input.permissions.includes(TRIP_MANAGE_PERMISSION)

  const entries = useQuery({
    enabled: canReadEntries && input.tripId !== '',
    queryFn: () => getTripFinancialsClient().readRevenues(input.tripId),
    queryKey: [TRIP_REVENUE_ENTRIES_QUERY_KEY, input.tripId],
  })

  const entryKinds = useQuery({
    enabled: canRecord,
    queryFn: () => getTripFinancialsClient().readActiveEntryKinds('revenue'),
    queryKey: [COMPANY_ENTRY_KINDS_QUERY_KEY, 'revenue'],
  })

  const record = useMutation({
    mutationFn: (fields: TripRevenueEntryFormFields) =>
      getTripFinancialsClient().recordRevenue({
        ...toTripRevenueEntryBody(fields),
        tripId: input.tripId,
      }),
    /**
     * O lançamento muda a lista e muda a conta **prevista**. Não toca no congelado: receita
     * lançada não reabre resultado fechado, e invalidá-lo buscaria payload idêntico sugerindo o
     * contrário.
     */
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [TRIP_REVENUE_ENTRIES_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [TRIP_VALUATION_QUERY_KEY] })
    },
  })

  const remove = useMutation({
    mutationFn: (entryId: string) =>
      getTripFinancialsClient().removeRevenue({ entryId, tripId: input.tripId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [TRIP_REVENUE_ENTRIES_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [TRIP_VALUATION_QUERY_KEY] })
    },
  })

  return {
    canReadEntries,
    canRecord,
    entries: entries.data ?? [],
    entryKinds: entryKinds.data ?? [],
    isError: entries.isError,
    isLoading: entries.isLoading,
    isRecording: record.isPending,
    isRemoving: remove.isPending,
    async record(fields) {
      try {
        await record.mutateAsync(fields)
        return true
      } catch {
        /** A recusa já é estado da mutação; relançar aqui só produziria rejeição solta. */
        return false
      }
    },
    async remove(entryId) {
      try {
        await remove.mutateAsync(entryId)
        return true
      } catch {
        return false
      }
    },
    retry() {
      void entries.refetch()
    },
  }
}
