/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { DRIVER_CLIENT_EMAILS_QUERY_KEY } from './driverClientEmails.query'
import { getDriverDetectedClientEmailApi } from './driverDetectedClientEmail.service'

export const DRIVER_DETECTED_EMAIL_QUERY_KEY = ['driver-conversations', 'detected-email'] as const

/** O motorista acabou de escrever: o cartão relê enquanto a conversa está aberta e há rede. */
const REFRESH_MS = 10_000

/** Spec 279 T4b (RF8): com o tipo desligado (`409`) ou sem rede, o cartão simplesmente não aparece. */
export function useDriverDetectedClientEmailQuery(
  input: Readonly<{ canSync: boolean; id: string }>,
) {
  return useQuery({
    enabled: input.canSync,
    queryFn: () => getDriverDetectedClientEmailApi().read(input.id),
    queryKey: [...DRIVER_DETECTED_EMAIL_QUERY_KEY, input.id],
    refetchInterval: input.canSync ? REFRESH_MS : false,
    retry: false,
  })
}

export function useSendDriverDetectedClientEmailMutation(occurrenceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Readonly<{ idempotencyKey: string; messageId: string; save: boolean }>) =>
      getDriverDetectedClientEmailApi().send({ ...input, occurrenceId }),
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: [...DRIVER_DETECTED_EMAIL_QUERY_KEY, occurrenceId],
      })
      void queryClient.invalidateQueries({
        queryKey: [...DRIVER_CLIENT_EMAILS_QUERY_KEY, occurrenceId],
      })
    },
  })
}
