/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useQuery } from '@tanstack/react-query'

import { getTripClient } from '../hooks/useTripWorkspace.hook'
import type { TripDeliveryProof } from '../shared/canhotoBatchSelection.service'
import { resolveProofRadiusMeters } from '../shared/deliveryProof.service'
import { TRIP_QUERY_KEY } from '../shared/trip.constant'
import {
  buildTripDocumentProofBadgesByDocumentId,
  type TripDocumentProofBadges,
} from '../shared/tripDocumentProofBadges.service'

type TripProofBadgesQueryInput = Readonly<{
  canRead: boolean
  companyId: string
  /** Viagem que ainda não entregou nada não tem comprovante: a chamada seria à toa. */
  hasAnyProof: boolean
  tripId: string
}>

function buildTripProofsQueryOptions(input: TripProofBadgesQueryInput) {
  return {
    enabled: input.canRead && input.hasAnyProof && input.tripId !== '',
    queryFn: () => getTripClient().readTripDeliveryProofs({ tripId: input.tripId }),
    queryKey: [TRIP_QUERY_KEY, input.companyId, input.tripId, 'delivery-proofs-badges'] as const,
  }
}

/**
 * Spec 227 D4: o selo do cabeçalho da nota fechada vem de uma chamada só para a viagem inteira
 * (`GET /trips/:id/delivery-proofs`, `fleet.read`) — abrir nota por nota seria o oposto de um cabeçalho.
 * A chave mora sob a da viagem, então `invalidateTrip` a derruba junto depois de uma conferência.
 */
export function useTripProofBadgesQuery(input: TripProofBadgesQueryInput) {
  return useQuery<
    readonly TripDeliveryProof[],
    Error,
    ReadonlyMap<string, TripDocumentProofBadges>
  >({
    ...buildTripProofsQueryOptions(input),
    select: buildTripDocumentProofBadgesByDocumentId,
  })
}

/**
 * Revisão da 227 (A2): o raio tolerado só vem em `GET /trips/:id/delivery-proofs`; a rota por nota
 * não o traz. Mesma chave e mesma chamada dos selos — o cache de React Query deduplica.
 */
export function useTripProofRadiusQuery(input: TripProofBadgesQueryInput) {
  return useQuery<readonly TripDeliveryProof[], Error, number | undefined>({
    ...buildTripProofsQueryOptions(input),
    select: resolveProofRadiusMeters,
  })
}
