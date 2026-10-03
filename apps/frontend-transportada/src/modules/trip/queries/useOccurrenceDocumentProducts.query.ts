import { useQuery } from '@tanstack/react-query'

import { getTripClient } from '../hooks/useTripWorkspace.hook'
import { TRIP_QUERY_KEY } from '../shared/trip.constant'
import type { TripDocumentActionInput } from '../shared/trip.types'

/** Os itens da nota, para o formulário de correção oferecer o que a nota realmente tem. */
export function useOccurrenceDocumentProducts(input: TripDocumentActionInput) {
  return useQuery({
    queryFn: () => getTripClient().readTripDocumentProducts(input),
    queryKey: [TRIP_QUERY_KEY, input.tripId, 'document-products', input.documentId] as const,
  })
}
