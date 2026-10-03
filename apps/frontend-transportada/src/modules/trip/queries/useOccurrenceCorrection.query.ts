/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { TRIP_TIMELINE_QUERY_KEY } from '../hooks/useTripTimeline.hook'
import { getTripClient } from '../hooks/useTripWorkspace.hook'
import { TRIP_OCCURRENCES_KEY_SEGMENT, TRIP_QUERY_KEY } from '../shared/trip.constant'
import type {
  CancelTripOccurrenceInput,
  CorrectTripOccurrenceItemsInput,
  OccurrenceWriteResult,
} from '../shared/trip.types'
import { TRIP_OCCURRENCE_FEED_QUERY_KEY } from './tripOccurrenceFeed.query'

export type CorrectOccurrenceItemsVariables = Omit<
  CorrectTripOccurrenceItemsInput,
  'idempotencyKey'
>
export type CancelOccurrenceVariables = Omit<CancelTripOccurrenceInput, 'idempotencyKey'>

/**
 * Spec 235 RF8: detalhe, feed e linha do tempo da ocorrência moram sob a chave do feed; a linha do
 * tempo da viagem (e a de cada nota, que mora debaixo dela) sob `[trips, tripId, 'timeline']`; a lista de
 * ocorrências da nota, sob `[trips, companyId, tripId, 'occurrences', …]` — a mutação não conhece a
 * empresa, então o predicado casa pela viagem.
 */
async function invalidateOccurrenceCorrection(
  queryClient: QueryClient,
  tripId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: [TRIP_OCCURRENCE_FEED_QUERY_KEY] }),
    queryClient.invalidateQueries({ queryKey: [TRIP_QUERY_KEY, tripId, TRIP_TIMELINE_QUERY_KEY] }),
    queryClient.invalidateQueries({
      predicate: ({ queryKey }) =>
        queryKey[0] === TRIP_QUERY_KEY &&
        queryKey[2] === tripId &&
        queryKey[3] === TRIP_OCCURRENCES_KEY_SEGMENT,
    }),
  ])
}

/**
 * A `Idempotency-Key` nasce por tentativa, dentro da mutação. Invalida também no erro: um `409` de
 * tratativa que abriu entre carregar a tela e clicar pede o estado novo, não o que o operador viu.
 */
export function useCorrectOccurrenceItems() {
  const queryClient = useQueryClient()

  return useMutation<OccurrenceWriteResult, Error, CorrectOccurrenceItemsVariables>({
    mutationFn: (variables) =>
      getTripClient().correctTripOccurrenceItems({
        ...variables,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSettled: (_result, _error, variables) =>
      invalidateOccurrenceCorrection(queryClient, variables.tripId),
  })
}

export function useCancelOccurrence() {
  const queryClient = useQueryClient()

  return useMutation<OccurrenceWriteResult, Error, CancelOccurrenceVariables>({
    mutationFn: (variables) =>
      getTripClient().cancelTripOccurrence({ ...variables, idempotencyKey: crypto.randomUUID() }),
    onSettled: (_result, _error, variables) =>
      invalidateOccurrenceCorrection(queryClient, variables.tripId),
  })
}
