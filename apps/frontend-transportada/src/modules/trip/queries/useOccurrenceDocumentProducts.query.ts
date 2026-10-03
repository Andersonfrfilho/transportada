/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getTripClient } from '../hooks/useTripWorkspace.hook'
import { TRIP_QUERY_KEY } from '../shared/trip.constant'
import type { TripDocumentActionInput } from '../shared/trip.types'

export type OccurrenceDocumentProductsInput = TripDocumentActionInput &
  Readonly<{ companyId?: string }>

/** Os itens da nota, para o formulário de correção oferecer o que a nota realmente tem. */
export function useOccurrenceDocumentProducts({
  companyId,
  documentId,
  tripId,
}: OccurrenceDocumentProductsInput) {
  return useQuery({
    queryFn: () => getTripClient().readTripDocumentProducts({ documentId, tripId }),
    queryKey: [TRIP_QUERY_KEY, companyId, tripId, 'document-products', documentId] as const,
  })
}
