/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { TRIP_OCCURRENCE_FEED_QUERY_KEY } from '@/modules/trip/queries/tripOccurrenceFeed.query'

import { getDetectedClientEmailClient } from '../shared/detectedClientEmail.service'
import { CONTRACTOR_REPLY_EMAIL_OPTIONS_QUERY_KEY } from './contractorReplyEmail.query'
import { OCCURRENCE_CONVERSATIONS_QUERY_KEY } from './occurrenceConversation.query'

export const DETECTED_CLIENT_EMAIL_QUERY_KEY = 'detected-client-email'

/** O motorista escreve a qualquer hora: o cartão relê junto com a conversa e de tempos em tempos. */
const REFRESH_MS = 20_000

/** Spec 279 T4b (RF8): o e-mail que o motorista escreveu na conversa e ainda não saiu. */
export function useDetectedClientEmailQuery(
  input: Readonly<{ enabled: boolean; occurrenceId: string }>,
) {
  const client = getDetectedClientEmailClient()
  return useQuery({
    enabled: input.enabled,
    queryFn: () => client.read(input.occurrenceId),
    queryKey: [DETECTED_CLIENT_EMAIL_QUERY_KEY, input.occurrenceId],
    refetchInterval: REFRESH_MS,
    retry: false,
  })
}

/** O envio grava a entrega e, com `save`, o cadastro: o cartão, as opções do boleto e o cadastro são relidos. */
export function useSendDetectedClientEmailMutation(occurrenceId: string) {
  const queryClient = useQueryClient()
  const client = getDetectedClientEmailClient()
  return useMutation({
    mutationFn: (input: Readonly<{ idempotencyKey: string; messageId: string; save: boolean }>) =>
      client.send({ ...input, occurrenceId }),
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: [DETECTED_CLIENT_EMAIL_QUERY_KEY, occurrenceId],
      })
      void queryClient.invalidateQueries({
        queryKey: [CONTRACTOR_REPLY_EMAIL_OPTIONS_QUERY_KEY, occurrenceId],
      })
      void queryClient.invalidateQueries({ queryKey: ['delivery-client-emails'] })
      void queryClient.invalidateQueries({ queryKey: [OCCURRENCE_CONVERSATIONS_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [TRIP_OCCURRENCE_FEED_QUERY_KEY] })
    },
  })
}
