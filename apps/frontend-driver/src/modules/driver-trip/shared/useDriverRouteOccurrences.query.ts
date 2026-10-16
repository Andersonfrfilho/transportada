/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { useDriverSession } from '../hooks/useDriverSession.hook'
import type {
  RouteOccurrenceKind,
  RouteOccurrencesQueryData,
  RouteOccurrencesReadResult,
  DriverRouteOccurrenceDetail,
} from './driverRouteOccurrence.types'
import { getDriverTripClient } from './driverTripClient.service'
import { createIndexedDbRouteOccurrenceSnapshotStore } from './indexedDbQueue.service'
import { loadRouteOccurrences } from './routeOccurrenceSnapshot.service'

export const ROUTE_OCCURRENCES_QUERY_KEY = ['driver-trip', 'route-occurrences'] as const

/** A mesma cadência da viagem atual: o escritório resolve por conta própria e a mudança chega no próximo ciclo. */
const ROUTE_OCCURRENCES_REFETCH_MS = 30_000

const SNAPSHOT_STORE = createIndexedDbRouteOccurrenceSnapshotStore()

/** A lista da viagem. Sem `tripId` (nenhuma viagem selecionada) a consulta não roda. */
export function useDriverRouteOccurrences(input: {
  readonly canSync: boolean
  readonly tripId: string | undefined
}) {
  const { tripId } = input
  const { subHash } = useDriverSession()
  return useQuery<RouteOccurrencesQueryData>({
    enabled: input.canSync && tripId !== undefined,
    // A leitura cai sozinha no retrato guardado quando a rede falha; pausar a consulta offline o esconderia.
    networkMode: 'always',
    queryFn: () =>
      loadRouteOccurrences({
        now: new Date(),
        readList: () => getDriverTripClient().listRouteOccurrences(),
        store: SNAPSHOT_STORE,
        subHash,
        tripId: tripId ?? '',
      }),
    queryKey: [...ROUTE_OCCURRENCES_QUERY_KEY, tripId],
    refetchInterval: ROUTE_OCCURRENCES_REFETCH_MS,
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
    retry: false,
  })
}

/** O detalhe não tem retrato: sem rede, a tela mostra o que a lista já guardou. */
export function useDriverRouteOccurrenceDetail(input: {
  readonly canSync: boolean
  readonly id: string
  readonly kind: RouteOccurrenceKind
}) {
  return useQuery<RouteOccurrencesReadResult<DriverRouteOccurrenceDetail>>({
    enabled: input.canSync,
    queryFn: () => getDriverTripClient().readRouteOccurrence({ id: input.id, kind: input.kind }),
    queryKey: [...ROUTE_OCCURRENCES_QUERY_KEY, 'detail', input.kind, input.id],
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
    retry: false,
  })
}
