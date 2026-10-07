/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  CARGO_ARRIVALS_LIST_KEY,
  cargoArrivalDetailQueryKey,
} from '../queries/useCargoArrivals.query'
import type { CargoTransitionTarget } from '../shared/cargoArrival.types'
import { getCargoReceivingClient } from '../shared/cargoReceivingClient.service'

/** O que o escritório faz sobre uma chegada: tudo termina relendo o detalhe e a lista (contagens). */
function useRefreshArrival(arrivalId: string) {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: cargoArrivalDetailQueryKey(arrivalId) })
    void queryClient.invalidateQueries({ queryKey: CARGO_ARRIVALS_LIST_KEY })
  }
}

export function useBatchStatusMutation(arrivalId: string) {
  const refresh = useRefreshArrival(arrivalId)
  return useMutation({
    mutationFn: (input: Readonly<{ documentIds: readonly string[]; to: CargoTransitionTarget }>) =>
      getCargoReceivingClient().batchStatus({ arrivalId, ...input }),
    onSettled: refresh,
  })
}

export function useAssignRouteMutation(arrivalId: string) {
  const refresh = useRefreshArrival(arrivalId)
  return useMutation({
    mutationFn: (input: Readonly<{ documentIds: readonly string[]; routeName: string | null }>) =>
      getCargoReceivingClient().assignRoute({ arrivalId, ...input }),
    onSettled: refresh,
  })
}

export function useCloseCargoArrivalMutation(arrivalId: string) {
  const refresh = useRefreshArrival(arrivalId)
  return useMutation({
    mutationFn: () => getCargoReceivingClient().closeArrival(arrivalId),
    onSettled: refresh,
  })
}
