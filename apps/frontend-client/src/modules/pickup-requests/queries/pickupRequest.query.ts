/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { PortalClient } from '@/modules/shared/portalClient.service'
import type { PickupRequestInput } from '@/modules/shared/portal.types'

export const PICKUP_REQUESTS_KEY = ['client', 'pickup-requests'] as const

export function usePickupRequests(client: PortalClient) {
  return useQuery({ queryFn: () => client.listPickupRequests(), queryKey: PICKUP_REQUESTS_KEY })
}

export function useCreatePickupRequest(client: PortalClient) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PickupRequestInput) => client.createPickupRequest(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PICKUP_REQUESTS_KEY })
    },
  })
}

export function useCancelPickupRequest(client: PortalClient) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => client.cancelPickupRequest(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PICKUP_REQUESTS_KEY })
    },
  })
}
