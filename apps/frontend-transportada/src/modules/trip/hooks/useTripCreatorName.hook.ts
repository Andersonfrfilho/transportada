/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { TRIP_QUERY_KEY, TRIP_TIMELINE_DEFAULT_LIMIT } from '../shared/trip.constant'
import { readTripCreatorName } from '../shared/tripCreator.service'
import { getTripClient } from './useTripWorkspace.hook'

type UseTripCreatorNameInput = Readonly<{
  canRead: boolean
  tripId: string
}>

/**
 * Consulta **própria**, fora da linha do tempo visível: buscar páginas extras na mesma consulta
 * mudava a paginação do painel ("Carregar mais" sumia). Só roda quando alguém pede o nome — o
 * diálogo de conferência monta este hook ao abrir. O autor da criação nunca muda, então não
 * se relê.
 */
export function useTripCreatorName({ canRead, tripId }: UseTripCreatorNameInput): null | string {
  const query = useQuery({
    enabled: canRead && tripId !== '',
    queryFn: () =>
      readTripCreatorName((cursor) =>
        getTripClient().readTripTimeline({
          cursor,
          limit: TRIP_TIMELINE_DEFAULT_LIMIT,
          tripId,
        }),
      ),
    queryKey: [TRIP_QUERY_KEY, tripId, 'creator'] as const,
    staleTime: Infinity,
  })

  return query.data ?? null
}
