/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getTripClient } from '../hooks/useTripWorkspace.hook'
import type { TripDeliveryProof } from '../shared/canhotoBatchSelection.service'
import { TRIP_QUERY_KEY } from '../shared/trip.constant'

type TripDeliveryProofsQueryInput = Readonly<{
  canManage: boolean
  companyId: string
  hasSelection: boolean
  tripId: string
}>

/**
 * Spec 222 T2.4: o maço precisa saber de uma vez quais notas marcadas têm canhoto pendente. A chave
 * mora sob a da viagem para que `invalidateTrip` a derrube junto, e `enabled` exige `trip.manage` e
 * seleção — o detalhe da viagem não passa a buscar comprovante de graça.
 */
export function useTripDeliveryProofsQuery(input: TripDeliveryProofsQueryInput) {
  return useQuery<readonly TripDeliveryProof[]>({
    enabled: input.canManage && input.hasSelection && input.tripId !== '',
    queryFn: () => getTripClient().readTripDeliveryProofs({ tripId: input.tripId }),
    queryKey: [TRIP_QUERY_KEY, input.companyId, input.tripId, 'delivery-proofs-batch'] as const,
  })
}
