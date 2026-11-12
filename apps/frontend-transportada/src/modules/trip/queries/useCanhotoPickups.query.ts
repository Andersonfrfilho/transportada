/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getCanhotoPickupClient } from '../shared/canhotoPickupClient.provider'
import type { CanhotoPickup } from '../shared/canhotoPickup.service'
import { TRIP_QUERY_KEY } from '../shared/trip.constant'

const CANHOTO_PICKUPS_QUERY_KEY = [TRIP_QUERY_KEY, 'canhoto-pickups'] as const

/** Spec 321 T5: as coletas abertas (`pending` e `scheduled`); `enabled` é `trip.report-on-behalf`, como a rota. */
export function useCanhotoPickupsQuery(input: Readonly<{ enabled: boolean }>) {
  return useQuery<readonly CanhotoPickup[]>({
    enabled: input.enabled,
    queryFn: () => getCanhotoPickupClient().list(['pending', 'scheduled']),
    queryKey: CANHOTO_PICKUPS_QUERY_KEY,
  })
}

/** Encaixar ou desencaixar mexe nas paradas da viagem (a rota planejada pode morrer): relê a viagem e as listas. */
function useInvalidateAfterPickupChange() {
  const queryClient = useQueryClient()

  return () => {
    void queryClient.invalidateQueries({ queryKey: [TRIP_QUERY_KEY] })
  }
}

export function useScheduleCanhotoPickupMutation() {
  const invalidate = useInvalidateAfterPickupChange()

  return useMutation({
    mutationFn: (input: Readonly<{ pickupId: string; tripId: string }>) =>
      getCanhotoPickupClient().schedule(input),
    onSuccess: invalidate,
  })
}

export function useUnscheduleCanhotoPickupMutation() {
  const invalidate = useInvalidateAfterPickupChange()

  return useMutation({
    mutationFn: (pickupId: string) => getCanhotoPickupClient().unschedule(pickupId),
    onSuccess: invalidate,
  })
}
