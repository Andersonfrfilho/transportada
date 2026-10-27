/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { TRIP_OCCURRENCE_FEED_QUERY_KEY } from '@/modules/trip/queries/tripOccurrenceFeed.query'

import { getContractorReplyEmailClient } from '../shared/contractorReplyEmailClient.provider'
import { OCCURRENCE_CONVERSATIONS_QUERY_KEY } from './occurrenceConversation.query'
import { OCCURRENCE_CLIENT_EMAILS_QUERY_KEY } from './occurrenceClientEmails.query'

export const CONTRACTOR_REPLY_WHATSAPP_OPTIONS_QUERY_KEY = 'contractor-reply-whatsapp-options'

/** Spec 281 T7: o estado do envio por WhatsApp do boleto; as rotas de leitura e de escrita são as da T5. */
export function useContractorReplyWhatsAppOptionsQuery(
  input: Readonly<{ enabled: boolean; occurrenceId: string }>,
) {
  const client = getContractorReplyEmailClient()
  return useQuery({
    enabled: input.enabled,
    queryFn: () => client.readContractorReplyWhatsAppOptions({ occurrenceId: input.occurrenceId }),
    queryKey: [CONTRACTOR_REPLY_WHATSAPP_OPTIONS_QUERY_KEY, input.occurrenceId],
  })
}

function useInvalidateAfterWhatsAppSend(occurrenceId: string): () => void {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({
      queryKey: [CONTRACTOR_REPLY_WHATSAPP_OPTIONS_QUERY_KEY, occurrenceId],
    })
    void queryClient.invalidateQueries({ queryKey: [OCCURRENCE_CLIENT_EMAILS_QUERY_KEY] })
    void queryClient.invalidateQueries({ queryKey: [OCCURRENCE_CONVERSATIONS_QUERY_KEY] })
    void queryClient.invalidateQueries({ queryKey: [TRIP_OCCURRENCE_FEED_QUERY_KEY] })
  }
}

export type ForwardContractorReplyToClientWhatsAppInput = Readonly<{
  attachmentId?: string
  contactIds?: readonly string[]
  idempotencyKey: string
  number?: string
  save?: boolean
}>

/** O envio grava a entrega e, com `save`, o cadastro: as opções, a conversa e o feed são relidos. */
export function useForwardContractorReplyToClientWhatsAppMutation(occurrenceId: string) {
  const client = getContractorReplyEmailClient()
  const invalidate = useInvalidateAfterWhatsAppSend(occurrenceId)
  return useMutation({
    mutationFn: (input: ForwardContractorReplyToClientWhatsAppInput) =>
      client.forwardContractorReplyToClientWhatsApp({ ...input, occurrenceId }),
    onSettled: invalidate,
  })
}

/** "Tentar de novo" e "Reenviar" gravam uma entrega nova; o número e o anexo vêm da entrega antiga. */
export function useResendWhatsAppDeliveryMutation(occurrenceId: string) {
  const client = getContractorReplyEmailClient()
  const invalidate = useInvalidateAfterWhatsAppSend(occurrenceId)
  return useMutation({
    mutationFn: (input: Readonly<{ deliveryId: string; idempotencyKey: string }>) =>
      client.resendContractorReplyWhatsAppDelivery({ ...input, occurrenceId }),
    onSettled: invalidate,
  })
}
