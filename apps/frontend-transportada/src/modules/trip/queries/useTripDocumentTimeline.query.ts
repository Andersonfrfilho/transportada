/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useInfiniteQuery } from '@tanstack/react-query'

import { getTripClient } from '../hooks/useTripWorkspace.hook'
import { TRIP_QUERY_KEY, TRIP_TIMELINE_DEFAULT_LIMIT, canReadTrip } from '../shared/trip.constant'
import type { TripTimelinePage } from '../shared/trip.types'

const TRIP_DOCUMENT_TIMELINE_KEY_PART = 'timeline'

/**
 * Spec 233 T5.3: os eventos de **uma** nota, filtrados no servidor (`?documentId=`). A chave mora sob
 * `[trip, id, 'timeline']`, então o que invalida a linha do tempo da viagem derruba esta junto. A
 * leitura exige a mesma permissão de `useTripTimeline` (`canReadTrip`), e quem monta o componente só
 * o faz com a nota aberta — a consulta não corre com a nota fechada.
 */
export function useTripDocumentTimelineQuery(
  input: Readonly<{
    documentId: string
    permissions: readonly string[]
    tripId: string
  }>,
) {
  return useInfiniteQuery({
    enabled: canReadTrip(input.permissions) && input.tripId !== '' && input.documentId !== '',
    getNextPageParam: (lastPage: TripTimelinePage) => lastPage.nextCursor,
    initialPageParam: null as null | string,
    queryFn: ({ pageParam }) =>
      getTripClient().readTripTimeline({
        cursor: pageParam,
        documentId: input.documentId,
        limit: TRIP_TIMELINE_DEFAULT_LIMIT,
        tripId: input.tripId,
      }),
    queryKey: [
      TRIP_QUERY_KEY,
      input.tripId,
      TRIP_DOCUMENT_TIMELINE_KEY_PART,
      'document',
      input.documentId,
    ] as const,
  })
}
