/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import type { RouteOccurrenceServerState } from '@/modules/driver-trip/shared/driverRouteOccurrence.types'
import { getDriverTripClient } from '@/modules/driver-trip/shared/driverTripClient.service'
import { ROUTE_OCCURRENCES_QUERY_KEY } from '@/modules/driver-trip/shared/useDriverRouteOccurrences.query'

const STATES_REFETCH_MS = 30_000

/** O estado de cada ocorrência da rota, por id: o que decide se o campo de texto da conversa abre. */
export function useRouteOccurrenceStates(
  canSync: boolean,
): ReadonlyMap<string, RouteOccurrenceServerState> {
  const query = useQuery({
    enabled: canSync,
    queryFn: async () => {
      const result = await getDriverTripClient().listRouteOccurrences()
      const occurrences = result.status === 'loaded' ? result.data : []
      return new Map(occurrences.map((occurrence) => [occurrence.id, occurrence.state] as const))
    },
    queryKey: [...ROUTE_OCCURRENCES_QUERY_KEY, 'conversation-states'],
    refetchInterval: STATES_REFETCH_MS,
    retry: false,
  })
  return query.data ?? new Map()
}
