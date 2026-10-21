/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getTripClient } from '../hooks/useTripWorkspace.hook'
import { TRIP_QUERY_KEY } from '../shared/trip.constant'

export type FieldOccurrenceTypesInput = Readonly<{
  documentIds: readonly string[]
  isEnabled: boolean
}>

/**
 * Spec 156 T9 e spec 270 (D5): o catálogo do lote de ocorrência do escritório **para as notas do lote** — o
 * servidor lê a contratante de cada uma e oferece a interseção; sem notas, só os tipos de todas.
 */
export function useFieldOccurrenceTypesQuery({
  documentIds,
  isEnabled,
}: FieldOccurrenceTypesInput) {
  const sortedIds = [...documentIds].toSorted()
  return useQuery({
    enabled: isEnabled,
    queryFn: () => getTripClient().readFieldOccurrenceTypes({ documentIds: sortedIds }),
    queryKey: [TRIP_QUERY_KEY, 'field-occurrence-types', sortedIds] as const,
  })
}
