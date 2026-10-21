/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getTripClient } from '../hooks/useTripWorkspace.hook'
import { TRIP_QUERY_KEY } from '../shared/trip.constant'

export type SeparationOccurrenceTypesInput = Readonly<{
  documentId: string
  isEnabled: boolean
  tripId: string
}>

/**
 * Spec 270 (R6): os tipos do galpão **para esta nota** — o servidor filtra pela contratante dela. A tela não
 * decide escopo nem etapa: o que ele devolve é o que se oferece, e a lista muda quando a nota muda.
 */
export function useSeparationOccurrenceTypesQuery({
  documentId,
  isEnabled,
  tripId,
}: SeparationOccurrenceTypesInput) {
  return useQuery({
    enabled: isEnabled,
    queryFn: () => getTripClient().listSeparationOccurrenceTypes({ documentId, tripId }),
    queryKey: [TRIP_QUERY_KEY, 'separation-occurrence-types', tripId, documentId] as const,
  })
}
