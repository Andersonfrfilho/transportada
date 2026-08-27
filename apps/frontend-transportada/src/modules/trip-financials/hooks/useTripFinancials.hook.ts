/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getTripFinancialsClient } from '../shared/tripFinancialsClient.service'
import type { TripFinancialResult } from '../shared/tripFinancials.types'

const TRIP_FINANCIALS_QUERY_KEY = 'trip-financials'
const FINANCIALS_PERMISSION = 'trip.financials'

export type TripFinancialsController = Readonly<{
  canReadFinancials: boolean
  isLoading: boolean
  recalculate: (reason: string) => Promise<void>
  result: TripFinancialResult | null
}>

/**
 * Spec 061 D4: a consulta só liga para quem tem `trip.financials`. Sem a permissão, a tela não
 * pergunta — pedir e receber 403 encheria o log de recusa esperada, e o painel nem existe.
 */
export function useTripFinancials(
  input: Readonly<{ permissions: readonly string[]; tripId: string }>,
): TripFinancialsController {
  const queryClient = useQueryClient()
  const canReadFinancials = input.permissions.includes(FINANCIALS_PERMISSION)

  const result = useQuery({
    enabled: canReadFinancials && input.tripId !== '',
    queryFn: () => getTripFinancialsClient().readResult(input.tripId),
    queryKey: [TRIP_FINANCIALS_QUERY_KEY, input.tripId],
  })

  const recalculate = useMutation({
    mutationFn: (reason: string) =>
      getTripFinancialsClient().recalculate({ reason, tripId: input.tripId }),
    /** A revalidação não segura o botão: `isPending` cai quando o trabalho acaba, não o cache. */
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [TRIP_FINANCIALS_QUERY_KEY] })
    },
  })

  return {
    canReadFinancials,
    isLoading: result.isLoading,
    async recalculate(reason) {
      await recalculate.mutateAsync(reason)
    },
    result: result.data ?? null,
  }
}
