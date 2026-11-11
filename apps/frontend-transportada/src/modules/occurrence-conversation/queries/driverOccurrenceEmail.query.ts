/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { DriverOccurrenceEmailSettings } from '../shared/driverOccurrenceEmail.service'
import { getDriverOccurrenceEmailClient } from '../shared/driverOccurrenceEmailClient.provider'

export const DRIVER_OCCURRENCE_EMAIL_QUERY_KEY = [
  'occurrence-conversation',
  'driver-occurrence-email',
] as const

/** `enabled` é `settings.manage`: sem a permissão a API recusaria a leitura. */
export function useDriverOccurrenceEmailQuery(input: Readonly<{ enabled: boolean }>) {
  return useQuery<DriverOccurrenceEmailSettings>({
    enabled: input.enabled,
    queryFn: () => getDriverOccurrenceEmailClient().get(),
    queryKey: DRIVER_OCCURRENCE_EMAIL_QUERY_KEY,
    retry: false,
  })
}

/** O valor pedido aparece já; se a API recusar, volta ao anterior e o erro fica na mutação. */
export function useSaveDriverOccurrenceEmailMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => getDriverOccurrenceEmailClient().save(enabled),
    onError: (_error, _enabled, previous) => {
      queryClient.setQueryData(DRIVER_OCCURRENCE_EMAIL_QUERY_KEY, previous)
    },
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: DRIVER_OCCURRENCE_EMAIL_QUERY_KEY })
      const previous = queryClient.getQueryData<DriverOccurrenceEmailSettings>(
        DRIVER_OCCURRENCE_EMAIL_QUERY_KEY,
      )
      if (previous !== undefined) {
        queryClient.setQueryData(DRIVER_OCCURRENCE_EMAIL_QUERY_KEY, { ...previous, enabled })
      }
      return previous
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: DRIVER_OCCURRENCE_EMAIL_QUERY_KEY })
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(DRIVER_OCCURRENCE_EMAIL_QUERY_KEY, settings)
    },
  })
}
