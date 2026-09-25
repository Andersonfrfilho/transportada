/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { uploadConversationAttachments } from '../shared/conversationAttachment.service'
import { createDriverConversationClient } from '../shared/driverConversationClient.service'
import type { ConversationMessageDraft } from './occurrenceConversation.query'

export const DRIVER_CONVERSATIONS_QUERY_KEY = 'driver-occurrence-conversations'

function getClient() {
  return createDriverConversationClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/** Spec 183 T604: baixar a lista é o que marca "entregue" no servidor (RF14). */
export function useDriverConversationsQuery(input: Readonly<{ enabled: boolean }>) {
  return useQuery({
    enabled: input.enabled,
    queryFn: () => getClient().listConversations(),
    queryKey: [DRIVER_CONVERSATIONS_QUERY_KEY],
  })
}

export function useDriverConversationMessagesQuery(occurrenceId: string) {
  return useQuery({
    queryFn: () => getClient().listMessages(occurrenceId),
    queryKey: [DRIVER_CONVERSATIONS_QUERY_KEY, occurrenceId],
  })
}

/** Abrir a conversa é ler (RF14): a contagem do atalho volta a ser buscada. */
export function useMarkDriverConversationReadMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (occurrenceId: string) => getClient().markRead(occurrenceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [DRIVER_CONVERSATIONS_QUERY_KEY] })
    },
  })
}

export function useReplyDriverConversationMutation(occurrenceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    /** Spec 183 T702b: sobe os anexos (reusando os já subidos do rascunho) e responde com eles. */
    mutationFn: async (input: ConversationMessageDraft) => {
      const client = getClient()
      const attachmentIds = await uploadConversationAttachments({
        files: input.files,
        putFile: (upload) => client.putUpload(upload),
        requestUpload: (declared) => client.requestUpload({ ...declared, occurrenceId }),
        uploaded: input.uploaded,
      })
      await client.reply({
        attachmentIds,
        body: input.body,
        idempotencyKey: input.idempotencyKey,
        occurrenceId,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [DRIVER_CONVERSATIONS_QUERY_KEY] })
    },
  })
}
