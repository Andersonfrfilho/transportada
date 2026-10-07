/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getTripClient } from '../hooks/useTripWorkspace.hook'
import { TRIP_QUERY_KEY } from '../shared/trip.constant'
import type { TripDocumentActionInput } from '../shared/trip.types'

export type OccurrenceDocumentProductsInput = TripDocumentActionInput &
  Readonly<{
    companyId?: string
    /** Spec 247 T5.4: o acerto só pede a nota quando tem itens a sugerir. Padrão: liga. */
    isEnabled?: boolean
  }>

/** Os itens da nota, para o formulário de correção oferecer o que a nota realmente tem. */
export function useOccurrenceDocumentProducts({
  companyId,
  documentId,
  isEnabled = true,
  tripId,
}: OccurrenceDocumentProductsInput) {
  return useQuery({
    enabled: isEnabled,
    queryFn: () => getTripClient().readTripDocumentProducts({ documentId, tripId }),
    queryKey: [TRIP_QUERY_KEY, companyId, tripId, 'document-products', documentId] as const,
  })
}
