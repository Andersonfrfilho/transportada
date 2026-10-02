import { useInfiniteQuery } from '@tanstack/react-query'

import { canReadTrip, TRIP_QUERY_KEY, TRIP_TIMELINE_DEFAULT_LIMIT } from '../shared/trip.constant'
import {
  resolveTripTimelineRefetchInterval,
  type TripPollingDocument,
} from '../shared/tripPolling.service'
import type { TripTimelinePage } from '../shared/trip.types'
import { getTripClient } from './useTripWorkspace.hook'

export const TRIP_TIMELINE_QUERY_KEY = 'timeline'

/**
 * Spec 158 D4: mesma política de leitura das outras leituras de campo (`fleet.read` **ou**
 * `trip.report-on-behalf`) — o escritório que dá baixa em nome do motorista também confere a linha
 * do tempo, sem ganhar `fleet.read`.
 *
 * Spec 057 P2: `tripDocuments` e `tripStatus` vêm do corpo da viagem só para decidir a repetição —
 * a consulta em si não depende deles. Ausentes (viagem ainda carregando), não se repete.
 */
export function useTripTimeline(
  input: Readonly<{
    permissions: readonly string[]
    tripDocuments?: readonly TripPollingDocument[] | undefined
    tripId: string | undefined
    tripStatus?: string | undefined
  }>,
) {
  const canRead = canReadTrip(input.permissions)

  return useInfiniteQuery({
    enabled: canRead && input.tripId !== undefined && input.tripId !== '',
    getNextPageParam: (lastPage: TripTimelinePage) => lastPage.nextCursor,
    initialPageParam: null as null | string,
    queryFn: ({ pageParam }) =>
      getTripClient().readTripTimeline({
        cursor: pageParam,
        limit: TRIP_TIMELINE_DEFAULT_LIMIT,
        tripId: input.tripId ?? '',
      }),
    queryKey: [TRIP_QUERY_KEY, input.tripId, TRIP_TIMELINE_QUERY_KEY] as const,
    refetchInterval: resolveTripTimelineRefetchInterval({
      documents: input.tripDocuments ?? [],
      status: input.tripStatus,
    }),
  })
}
