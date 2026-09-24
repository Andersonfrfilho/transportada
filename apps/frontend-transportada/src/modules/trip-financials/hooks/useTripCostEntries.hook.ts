import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  toTripCostEntryBody,
  type TripCostEntryFormFields,
} from '../shared/tripCostEntryForm.service'
import type { CompanyEntryKind, TripCostEntry } from '../shared/tripFinancials.types'
import { getTripFinancialsClient } from '../shared/tripFinancialsClient.service'
import {
  COMPANY_ENTRY_KINDS_QUERY_KEY,
  FINANCIALS_PERMISSION,
  TRIP_COST_ENTRIES_QUERY_KEY,
  TRIP_MANAGE_PERMISSION,
  TRIP_VALUATION_QUERY_KEY,
} from '../shared/tripFinancialsQueryKey.constant'

export type TripCostEntriesController = Readonly<{
  /** Lançar é `trip.manage`; ler é `trip.financials`. Sem a primeira, o formulário não existe. */
  canRecord: boolean
  canReadEntries: boolean
  entries: readonly TripCostEntry[]
  entryKinds: readonly CompanyEntryKind[]
  isError: boolean
  isLoading: boolean
  isRecording: boolean
  isRemoving: boolean
  /** `false` quando a API recusou: o formulário guarda o que foi digitado em vez de limpar. */
  record: (fields: TripCostEntryFormFields) => Promise<boolean>
  /** Spec 169 RF12/RF13: remove sem apagar — some da lista e da soma. */
  remove: (entryId: string) => Promise<boolean>
  retry: () => void
}>

/**
 * Spec 143 D6: o que já saiu do bolso nesta viagem, com autor, e o campo para lançar mais um.
 *
 * A consulta só liga para quem tem `trip.financials` — pedir e receber 403 encheria o log de recusa
 * esperada, e o painel que a hospeda nem existe sem a permissão.
 */
export function useTripCostEntries(
  input: Readonly<{ permissions: readonly string[]; tripId: string }>,
): TripCostEntriesController {
  const queryClient = useQueryClient()
  const canReadEntries = input.permissions.includes(FINANCIALS_PERMISSION)
  const canRecord = input.permissions.includes(TRIP_MANAGE_PERMISSION)

  const entries = useQuery({
    enabled: canReadEntries && input.tripId !== '',
    queryFn: () => getTripFinancialsClient().readCosts(input.tripId),
    queryKey: [TRIP_COST_ENTRIES_QUERY_KEY, input.tripId],
  })

  /** Spec 169 RF5: o seletor de gasto lê o mesmo cadastro do lado "expense". */
  const entryKinds = useQuery({
    enabled: canRecord,
    queryFn: () => getTripFinancialsClient().readActiveEntryKinds('expense'),
    queryKey: [COMPANY_ENTRY_KINDS_QUERY_KEY, 'expense'],
  })

  const record = useMutation({
    mutationFn: (fields: TripCostEntryFormFields) =>
      getTripFinancialsClient().recordCost({
        ...toTripCostEntryBody(fields),
        tripId: input.tripId,
      }),
    /**
     * O lançamento muda a lista e muda a conta **prevista**. Não toca no congelado: custo lançado
     * não reabre resultado fechado, e invalidá-lo buscaria payload idêntico sugerindo o contrário.
     *
     * A revalidação não segura o botão: `isPending` cai quando o trabalho acaba, não o cache.
     */
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [TRIP_COST_ENTRIES_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [TRIP_VALUATION_QUERY_KEY] })
    },
  })

  const remove = useMutation({
    mutationFn: (entryId: string) =>
      getTripFinancialsClient().removeCost({ entryId, tripId: input.tripId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [TRIP_COST_ENTRIES_QUERY_KEY] })
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
