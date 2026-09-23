/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  getTripOccurrenceFeedClient,
  TRIP_OCCURRENCE_FEED_QUERY_KEY,
} from '../queries/tripOccurrenceFeed.query'

/**
 * Spec 164 T22: as cinco transições da tratativa (RF5-RF8b), uma mutação por ação — cada uma
 * invalida o feed inteiro ao terminar, porque o `case` de cada item vem embutido na página (RF10),
 * não numa consulta própria para escrever de volta.
 */
export function useOccurrenceCaseActions() {
  const client = getTripOccurrenceFeedClient()
  const queryClient = useQueryClient()

  function invalidateFeed(): void {
    void queryClient.invalidateQueries({ queryKey: [TRIP_OCCURRENCE_FEED_QUERY_KEY] })
  }

  const review = useMutation({
    mutationFn: client.reviewOccurrenceCase,
    onSuccess: invalidateFeed,
  })
  const returnToWarehouse = useMutation({
    mutationFn: client.returnOccurrenceCaseToWarehouse,
    onSuccess: invalidateFeed,
  })
  const submitToContractor = useMutation({
    mutationFn: client.submitOccurrenceCaseToContractor,
    onSuccess: invalidateFeed,
  })
  const close = useMutation({
    mutationFn: client.closeOccurrenceCase,
    onSuccess: invalidateFeed,
  })
  const cancel = useMutation({
    mutationFn: client.cancelOccurrenceCase,
    onSuccess: invalidateFeed,
  })

  return { cancel, close, returnToWarehouse, review, submitToContractor }
}
