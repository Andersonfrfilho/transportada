/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { OCCURRENCE_CONVERSATIONS_QUERY_KEY } from '@/modules/occurrence-conversation/queries/occurrenceConversation.query'

import {
  getTripOccurrenceFeedClient,
  TRIP_OCCURRENCE_FEED_QUERY_KEY,
  TRIP_OCCURRENCE_RESOLUTION_SUMMARY_QUERY_KEY,
} from './tripOccurrenceFeed.query'

/** Feed, detalhe e linha do tempo moram sob a chave do feed; a conversa tem a própria. */
export function useResolveOccurrence() {
  const client = getTripOccurrenceFeedClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: client.resolveTripOccurrence,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [TRIP_OCCURRENCE_FEED_QUERY_KEY] })
      void queryClient.invalidateQueries({
        queryKey: [TRIP_OCCURRENCE_RESOLUTION_SUMMARY_QUERY_KEY],
      })
      void queryClient.invalidateQueries({ queryKey: [OCCURRENCE_CONVERSATIONS_QUERY_KEY] })
    },
  })
}
