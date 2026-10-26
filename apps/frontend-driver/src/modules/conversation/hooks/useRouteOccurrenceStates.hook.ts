/* Copyright (c) 2026 Ada Technology. MIT License. */
import { skipToken, useQuery } from '@tanstack/react-query'

import { CURRENT_TRIP_QUERY_KEY } from '@/modules/driver-trip/hooks/useDriverTrip.hook'
import { useDriverSession } from '@/modules/driver-trip/hooks/useDriverSession.hook'
import { readStoredTripId } from '@/modules/driver-trip/hooks/useSelectedDriverTrip.hook'
import type {
  DriverRouteOccurrence,
  RouteOccurrenceServerState,
} from '@/modules/driver-trip/shared/driverRouteOccurrence.types'
import type { DriverTripSnapshot } from '@/modules/driver-trip/shared/driverTrip.types'
import { useDriverRouteOccurrences } from '@/modules/driver-trip/shared/useDriverRouteOccurrences.query'

import {
  buildOccurrenceMap,
  buildOccurrenceStateMap,
  resolveConversationTripId,
} from '../shared/occurrenceStateMap.service'

export type RouteOccurrenceStates = Readonly<{
  /** A leitura terminou (ou nem vai acontecer) e ainda assim faltou o estado: a tela avisa em vez de travar. */
  isSettled: boolean
  occurrenceById: ReadonlyMap<string, DriverRouteOccurrence>
  stateByOccurrenceId: ReadonlyMap<string, RouteOccurrenceServerState>
}>

/**
 * O estado de cada ocorrência da rota, por id: o que decide se o campo de texto da conversa abre.
 * Reusa a consulta da lista da rota (mesma chave, mesmo retrato offline), sem um segundo polling.
 */
export function useRouteOccurrenceStates(canSync: boolean): RouteOccurrenceStates {
  const session = useDriverSession()
  const currentTrip = useQuery<DriverTripSnapshot>({
    enabled: false,
    queryFn: skipToken,
    queryKey: CURRENT_TRIP_QUERY_KEY,
  })
  const trips = (currentTrip.data ?? session.initialSnapshot?.snapshot)?.trips ?? []
  const tripId = resolveConversationTripId({ selectedTripId: readStoredTripId(), trips })
  const query = useDriverRouteOccurrences({ canSync, tripId })
  return {
    isSettled: query.status !== 'pending' || query.fetchStatus === 'idle',
    occurrenceById: buildOccurrenceMap(query.data),
    stateByOccurrenceId: buildOccurrenceStateMap(query.data),
  }
}
