/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { OCCURRENCE_CONVERSATIONS_QUERY_KEY } from '@/modules/occurrence-conversation/queries/occurrenceConversation.query'

import { runOccurrenceBulkResolution } from '../shared/occurrenceBulkResolution.service'
import type { TripOccurrenceFeedItem } from '../shared/tripOccurrenceFeed.service'
import {
  getTripOccurrenceFeedClient,
  TRIP_OCCURRENCE_FEED_QUERY_KEY,
  TRIP_OCCURRENCE_RESOLUTION_SUMMARY_QUERY_KEY,
} from './tripOccurrenceFeed.query'

/** Mesma invalidação de `useResolveOccurrence`, uma vez só ao fim do lote. */
export function useBulkResolveOccurrences() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Readonly<{ items: readonly TripOccurrenceFeedItem[]; note: string }>) =>
      runOccurrenceBulkResolution({
        items: input.items,
        note: input.note,
        resolveOne: getTripOccurrenceFeedClient().resolveTripOccurrence,
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [TRIP_OCCURRENCE_FEED_QUERY_KEY] })
      void queryClient.invalidateQueries({
        queryKey: [TRIP_OCCURRENCE_RESOLUTION_SUMMARY_QUERY_KEY],
      })
      void queryClient.invalidateQueries({ queryKey: [OCCURRENCE_CONVERSATIONS_QUERY_KEY] })
    },
  })
}
