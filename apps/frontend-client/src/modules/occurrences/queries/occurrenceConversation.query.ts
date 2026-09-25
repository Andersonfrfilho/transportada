/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { OCCURRENCES_KEY } from '@/modules/deliveries/queries/portal.query'
import type { PortalClient } from '@/modules/shared/portalClient.service'
import type { PortalConversationMessageInput } from '@/modules/shared/portal.types'

function conversationKey(ref: string) {
  return ['client', 'occurrence-conversation', ref] as const
}

/** Spec 183 T653: a conversa só é lida quando o cartão abre — a lista não baixa fio nenhum. */
export function useOccurrenceConversation(
  client: PortalClient,
  input: { readonly enabled: boolean; readonly ref: string },
) {
  return useQuery({
    enabled: input.enabled,
    queryFn: () => client.readConversation(input.ref),
    queryKey: conversationKey(input.ref),
  })
}

export function useSendConversationMessage(client: PortalClient) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: PortalConversationMessageInput) => client.sendConversationMessage(input),
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: conversationKey(input.ref) })
    },
  })
}

/** Abrir marca como lida (RF15); a lista recarrega para o contador do botão zerar. */
export function useMarkConversationRead(client: PortalClient) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ref: string) => client.markConversationRead(ref),
    onSuccess: (_result, ref) => {
      void queryClient.invalidateQueries({ queryKey: conversationKey(ref) })
      void queryClient.invalidateQueries({ queryKey: OCCURRENCES_KEY })
    },
  })
}
