/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { OCCURRENCE_CONVERSATIONS_QUERY_KEY } from '@/modules/occurrence-conversation/queries/occurrenceConversation.query'

import {
  getTripOccurrenceFeedClient,
  TRIP_OCCURRENCE_FEED_QUERY_KEY,
} from './tripOccurrenceFeed.query'

/** Spec 317 (E13): grava o comprovante da transferência e recarrega o detalhe (e a conversa, que ganhou a mensagem). */
export function useRecordDriverPayoutReceipt() {
  const client = getTripOccurrenceFeedClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: client.recordDriverPayoutReceipt,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [TRIP_OCCURRENCE_FEED_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [OCCURRENCE_CONVERSATIONS_QUERY_KEY] })
    },
  })
}
