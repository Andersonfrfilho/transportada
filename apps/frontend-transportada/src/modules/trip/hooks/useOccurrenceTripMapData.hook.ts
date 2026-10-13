/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'

import { OCCURRENCE_TRIP_MAP_MAX_TIMELINE_PAGES } from '../shared/occurrenceTripMap.constant'
import { canReadTrip, TRIP_QUERY_KEY } from '../shared/trip.constant'
import type { TripDetail, TripTimelineItem } from '../shared/trip.types'
import { getTripClient } from './useTripWorkspace.hook'
import { useTripTimeline } from './useTripTimeline.hook'

type OccurrenceTripMapDataInput = Readonly<{
  companyId: string | undefined
  permissions: readonly string[]
  tripId: string
}>

export type OccurrenceTripMapData = Readonly<{
  /** Há mais eventos na API do que o teto de páginas leu: o mapa mostra os mais recentes e diz isso. */
  hasMoreEvents: boolean
  items: readonly TripTimelineItem[]
  retry: () => void
  status: 'error' | 'loading' | 'ready'
  stops: TripDetail['stops']
}>

const NO_ITEMS: readonly TripTimelineItem[] = []
const NO_STOPS: TripDetail['stops'] = []

/**
 * A viagem da ocorrência e a linha do tempo dela, sem chamada nova de rota: as paradas vêm de
 * `GET /trips/:id` (a mesma chave do detalhe da viagem, então a leitura é compartilhada) e os eventos
 * de `GET /trips/:id/timeline`, páginas lidas até o teto.
 */
export function useOccurrenceTripMapData(input: OccurrenceTripMapDataInput): OccurrenceTripMapData {
  const canRead = canReadTrip(input.permissions) && input.companyId !== undefined
  const tripQuery = useQuery({
    enabled: canRead && input.tripId !== '',
    queryFn: () => getTripClient().getTrip({ tripId: input.tripId }),
    queryKey: [TRIP_QUERY_KEY, input.companyId, input.tripId] as const,
  })
  const timelineQuery = useTripTimeline({ permissions: input.permissions, tripId: input.tripId })
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = timelineQuery
  const pageCount = timelineQuery.data?.pages.length ?? 0
  const isUnderPageCap = pageCount < OCCURRENCE_TRIP_MAP_MAX_TIMELINE_PAGES

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && isUnderPageCap) void fetchNextPage()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isUnderPageCap])

  const items = useMemo(
    () => timelineQuery.data?.pages.flatMap((page) => page.items) ?? NO_ITEMS,
    [timelineQuery.data],
  )
  const { refetch: refetchTrip } = tripQuery
  const { refetch: refetchTimeline } = timelineQuery
  const retry = useMemo(
    () => () => {
      if (tripQuery.isError) void refetchTrip()
      if (timelineQuery.isError) void refetchTimeline()
    },
    [refetchTimeline, refetchTrip, timelineQuery.isError, tripQuery.isError],
  )

  const status = resolveStatus({
    isError: tripQuery.isError || timelineQuery.isError,
    isPending: tripQuery.isPending || timelineQuery.isPending,
  })
  return {
    hasMoreEvents: hasNextPage && !isUnderPageCap,
    items,
    retry,
    status,
    stops: tripQuery.data?.stops ?? NO_STOPS,
  }
}

function resolveStatus(
  input: Readonly<{ isError: boolean; isPending: boolean }>,
): OccurrenceTripMapData['status'] {
  if (input.isError) return 'error'
  return input.isPending ? 'loading' : 'ready'
}
