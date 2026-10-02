/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useQuery } from '@tanstack/react-query'

import { getTripClient } from '../hooks/useTripWorkspace.hook'
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

/**
 * Spec 227 D4: o selo do cabeçalho da nota fechada vem de uma chamada só para a viagem inteira
 * (`GET /trips/:id/delivery-proofs`, `fleet.read`) — abrir nota por nota seria o oposto de um cabeçalho.
 * A chave mora sob a da viagem, então `invalidateTrip` a derruba junto depois de uma conferência.
 */
export function useTripProofBadgesQuery(input: TripProofBadgesQueryInput) {
  return useQuery<ReadonlyMap<string, TripDocumentProofBadges>>({
    enabled: input.canRead && input.hasAnyProof && input.tripId !== '',
    queryFn: async () =>
      buildTripDocumentProofBadgesByDocumentId(
        await getTripClient().readTripDeliveryProofs({ tripId: input.tripId }),
      ),
    queryKey: [TRIP_QUERY_KEY, input.companyId, input.tripId, 'delivery-proofs-badges'] as const,
  })
}
