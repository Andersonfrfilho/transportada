/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  MUTATION_EFFECT,
  invalidateMutationEffect,
} from '@/modules/shared/mutationInvalidation.service'

import { TRIP_QUERY_KEY, TRIP_REVIEW_QUERY_KEY } from '../shared/trip.constant'
import type { TripReviewChange } from '../shared/tripReview.types'
import { runReviewChange, waitMilliseconds } from '../shared/tripReviewQueue.service'
import { isTripEditable } from '../shared/tripStatus.service'
import { getTripClient } from './useTripWorkspace.hook'

const MOVE_TARGET_LIMIT = 100

/**
 * Spec 148 T7: a fila da viagem e as três ações sobre ela. Toda escrita solta ou vincula nota, então
 * refaz a viagem, a fila e as telas que dizem se a nota está disponível (D12).
 */
export function useTripReviewQueue(input: Readonly<{ enabled: boolean; tripId: string }>) {
  const queryClient = useQueryClient()
  const reviewsQuery = useQuery({
    enabled: input.enabled,
    queryFn: () => getTripClient().listTripDocumentReviews({ tripId: input.tripId }),
    queryKey: [TRIP_REVIEW_QUERY_KEY, input.tripId],
  })

  function handleChanged(): void {
    void queryClient.invalidateQueries({ queryKey: [TRIP_REVIEW_QUERY_KEY] })
    void queryClient.invalidateQueries({ queryKey: [TRIP_QUERY_KEY] })
    void invalidateMutationEffect({ effect: MUTATION_EFFECT.nfeDocumentLink, queryClient })
  }

  const releaseMutation = useMutation({
    mutationFn: (layoutId: string) =>
      getTripClient().releaseUnplacedDocuments({ layoutId, tripId: input.tripId }),
    onSuccess: handleChanged,
  })

  const changeMutation = useMutation({
    mutationFn: (change: {
      readonly change: TripReviewChange
      readonly nfeDocumentId: string
      readonly reviewId: string
    }) => runReviewChange({ ...change, client: getTripClient(), wait: waitMilliseconds }),
    onSuccess: handleChanged,
  })

  return { changeMutation, releaseMutation, reviewsQuery }
}

/** D10: as notas vivas do mesmo caminhão, com o Δ% — só quando o painel da troca abre. */
export function useTripSwapSuggestions(input: Readonly<{ enabled: boolean; reviewId: string }>) {
  return useQuery({
    enabled: input.enabled,
    queryFn: () => getTripClient().readSwapSuggestions({ reviewId: input.reviewId }),
    queryKey: [TRIP_REVIEW_QUERY_KEY, 'swap-suggestions', input.reviewId],
  })
}

/** Os destinos possíveis: viagem ainda aberta (a trava é só o despacho, D13), menos a de origem. */
export function useTripMoveTargets(input: Readonly<{ enabled: boolean; sourceTripId: string }>) {
  return useQuery({
    enabled: input.enabled,
    queryFn: async () => {
      const page = await getTripClient().listTrips({ cursor: null, limit: MOVE_TARGET_LIMIT })
      return page.items.filter(
        (trip) => trip.id !== input.sourceTripId && isTripEditable(trip.status),
      )
    },
    queryKey: [TRIP_QUERY_KEY, 'review-move-targets', input.sourceTripId],
  })
}
