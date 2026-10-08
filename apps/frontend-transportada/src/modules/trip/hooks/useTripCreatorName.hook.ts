/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect } from 'react'

import { findTripCreatorName } from '../shared/tripCreator.service'
import type { useTripTimeline } from './useTripTimeline.hook'

/** Teto de páginas buscadas só para achar a criação: uma viagem enorme não puxa a história toda. */
const MAX_PAGES_TO_FIND_CREATOR = 10

type TripTimelineQuery = ReturnType<typeof useTripTimeline>

/**
 * Reaproveita a consulta da linha do tempo (mesma chave de cache) e, se a criação — o item mais
 * antigo — ainda não chegou, busca as páginas seguintes até achá-la.
 */
export function useTripCreatorName(timeline: TripTimelineQuery): null | string | undefined {
  const pages = timeline.data?.pages ?? []
  const creatorName = findTripCreatorName(pages)
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = timeline
  const shouldFetchMore =
    creatorName === undefined &&
    hasNextPage &&
    !isFetchingNextPage &&
    pages.length < MAX_PAGES_TO_FIND_CREATOR

  useEffect(() => {
    if (shouldFetchMore) void fetchNextPage()
  }, [shouldFetchMore, fetchNextPage])

  return creatorName
}
