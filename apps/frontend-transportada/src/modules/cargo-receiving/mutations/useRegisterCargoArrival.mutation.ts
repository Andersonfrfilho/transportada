/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  CARGO_ARRIVALS_LIST_KEY,
  cargoArrivalDetailQueryKey,
} from '../queries/useCargoArrivals.query'
import { CARGO_RECEIVING_QUERY_KEY } from '../shared/cargoReceiving.constant'
import type { RegisterCargoArrivalInput } from '../shared/cargoArrival.types'
import { getCargoReceivingClient } from '../shared/cargoReceivingClient.service'

export type RegisterCargoArrivalVariables = Readonly<{
  idempotencyKey: string
  input: RegisterCargoArrivalInput
}>

export function useRegisterCargoArrivalMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (variables: RegisterCargoArrivalVariables) =>
      getCargoReceivingClient().registerArrival(variables),
    /** A chegada devolvida já é o detalhe inteiro: entra no cache sem uma segunda ida. */
    onSuccess: ({ arrival }) => {
      queryClient.setQueryData(cargoArrivalDetailQueryKey(arrival.id), arrival)
      void queryClient.invalidateQueries({ queryKey: CARGO_ARRIVALS_LIST_KEY })
      // As notas registradas saem da lista de disponíveis de todo contratante.
      void queryClient.invalidateQueries({
        queryKey: [CARGO_RECEIVING_QUERY_KEY, 'available-documents'],
      })
    },
  })
}
