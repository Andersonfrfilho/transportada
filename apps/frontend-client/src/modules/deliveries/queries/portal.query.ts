/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { PortalClient } from '@/modules/shared/portalClient.service'
import type { ChargeDecision, ScheduleInput } from '@/modules/shared/portal.types'

export const DELIVERIES_KEY = ['client', 'deliveries'] as const
export const BATCHES_KEY = ['client', 'extra-charge-batches'] as const
const LOCATION_REFRESH_MS = 60_000

export function useDeliveries(client: PortalClient) {
  return useQuery({ queryFn: () => client.listDeliveries(), queryKey: DELIVERIES_KEY })
}

/**
 * A posição se atualiza sozinha de minuto em minuto **enquanto a tela está aberta**, e só quando há
 * uma carga em trânsito para observar (o chamador passa `enabled`). Intervalo mais curto multiplicaria
 * requisição por nada: o celular do motorista não manda posição a cada segundo.
 */
export function useDeliveryLocation(
  client: PortalClient,
  input: { readonly accessKey: string; readonly enabled: boolean },
) {
  return useQuery({
    enabled: input.enabled,
    queryFn: () => client.readLocation(input.accessKey),
    queryKey: ['client', 'delivery-location', input.accessKey],
    refetchInterval: LOCATION_REFRESH_MS,
  })
}

export function useScheduleDelivery(client: PortalClient) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ScheduleInput) => client.schedule(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DELIVERIES_KEY })
    },
  })
}

export function useChargeBatches(client: PortalClient) {
  return useQuery({ queryFn: () => client.listBatches(), queryKey: BATCHES_KEY })
}

export function useDecideBatch(client: PortalClient) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {
      readonly batchId: string
      readonly decisions: readonly ChargeDecision[]
    }) => client.decideBatch(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BATCHES_KEY })
    },
  })
}
