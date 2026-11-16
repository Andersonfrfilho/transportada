/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { pickupRequestClient } from '../shared/pickupRequestClient.service'
import type { AcceptInput, PickupRequestStatus } from '../shared/pickupRequest.types'

const KEY = 'pickup-requests'

export function usePickupRequestList(input: Readonly<{ status: PickupRequestStatus | null }>) {
  return useQuery({
    queryFn: () => pickupRequestClient.list(input.status),
    queryKey: [KEY, 'list', input.status],
  })
}

export function usePickupRequestDetail(id: string | null) {
  return useQuery({
    enabled: id !== null,
    queryFn: () => pickupRequestClient.get(id ?? ''),
    queryKey: [KEY, 'detail', id],
  })
}

/** Toda decisão invalida a fila e o detalhe: a leitura nunca mostra o estado de antes. */
export function usePickupRequestActions() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [KEY] })
  return {
    accept: useMutation({
      mutationFn: (input: { readonly id: string; readonly values: AcceptInput }) =>
        pickupRequestClient.accept(input.id, input.values),
      onSuccess: invalidate,
    }),
    refuse: useMutation({
      mutationFn: (input: { readonly id: string; readonly note: string }) =>
        pickupRequestClient.refuse(input.id, input.note),
      onSuccess: invalidate,
    }),
    schedule: useMutation({
      mutationFn: (input: { readonly id: string; readonly tripId: string }) =>
        pickupRequestClient.schedule(input.id, input.tripId),
      onSuccess: invalidate,
    }),
  }
}
