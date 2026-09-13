/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type Query, useQuery } from '@tanstack/react-query'

import { getTripClient } from '../hooks/useTripWorkspace.hook'
import type { TripCargoLayoutPoll } from '../shared/trip.types'

const TRIP_CARGO_LAYOUT_QUERY_KEY = 'trip-cargo-layout'

/**
 * Spec 145 T11/T12: a planta da prévia pelo `layoutId`. ⚠️ A chave é o id: trocar de prévia troca a
 * consulta, e a resposta atrasada da anterior cai na chave dela, não na nova.
 */
export function useTripCargoLayoutQuery(
  input: Readonly<{
    enabled: boolean
    layoutId: string
    refetchInterval: (query: Query<TripCargoLayoutPoll>) => false | number
  }>,
) {
  return useQuery<TripCargoLayoutPoll>({
    enabled: input.enabled && input.layoutId !== '',
    queryFn: ({ signal }) => getTripClient().readCargoLayout({ layoutId: input.layoutId, signal }),
    queryKey: [TRIP_CARGO_LAYOUT_QUERY_KEY, input.layoutId],
    refetchInterval: input.refetchInterval,
  })
}
