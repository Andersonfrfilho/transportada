/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { TRIP_OCCURRENCE_FEED_QUERY_KEY } from '@/modules/trip/queries/tripOccurrenceFeed.query'

import type { ContractorReplyEmailTarget } from '../shared/contractorReplyEmail.service'
import { getContractorReplyEmailClient } from '../shared/contractorReplyEmailClient.provider'
import { OCCURRENCE_CONVERSATIONS_QUERY_KEY } from './occurrenceConversation.query'

export const CONTRACTOR_REPLY_EMAIL_OPTIONS_QUERY_KEY = 'contractor-reply-email-options'

/** Spec 248 T4.7: o estado do envio por e-mail do boleto; só quem escreve à contratante precisa dele. */
export function useContractorReplyEmailOptionsQuery(
  input: Readonly<{ enabled: boolean; occurrenceId: string }>,
) {
  const client = getContractorReplyEmailClient()
  return useQuery({
    enabled: input.enabled,
    queryFn: () => client.readContractorReplyEmailOptions({ occurrenceId: input.occurrenceId }),
    queryKey: [CONTRACTOR_REPLY_EMAIL_OPTIONS_QUERY_KEY, input.occurrenceId],
  })
}

export type ForwardContractorReplyByEmailInput = Readonly<{
  address?: string
  attachmentId: string
  idempotencyKey: string
  target: ContractorReplyEmailTarget
}>

export function useForwardContractorReplyByEmailMutation(occurrenceId: string) {
  const queryClient = useQueryClient()
  const client = getContractorReplyEmailClient()
  return useMutation({
    mutationFn: (input: ForwardContractorReplyByEmailInput) =>
      client.forwardContractorReplyByEmail({ ...input, occurrenceId }),
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: [CONTRACTOR_REPLY_EMAIL_OPTIONS_QUERY_KEY, occurrenceId],
      })
      void queryClient.invalidateQueries({ queryKey: [OCCURRENCE_CONVERSATIONS_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [TRIP_OCCURRENCE_FEED_QUERY_KEY] })
    },
  })
}

export type ForwardContractorReplyToClientInput = Readonly<{
  address?: string
  attachmentId?: string
  emailIds?: readonly string[]
  idempotencyKey: string
  save?: boolean
}>

/** Spec 279 T5: o envio ao cliente grava delivery e, com `save`, o cadastro: as opções e o cadastro são relidos. */
export function useForwardContractorReplyToClientMutation(occurrenceId: string) {
  const queryClient = useQueryClient()
  const client = getContractorReplyEmailClient()
  return useMutation({
    mutationFn: (input: ForwardContractorReplyToClientInput) =>
      client.forwardContractorReplyToClient({ ...input, occurrenceId }),
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: [CONTRACTOR_REPLY_EMAIL_OPTIONS_QUERY_KEY, occurrenceId],
      })
      void queryClient.invalidateQueries({ queryKey: ['delivery-client-emails'] })
      void queryClient.invalidateQueries({ queryKey: [OCCURRENCE_CONVERSATIONS_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [TRIP_OCCURRENCE_FEED_QUERY_KEY] })
    },
  })
}
