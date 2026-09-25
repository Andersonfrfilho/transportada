/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'
import { TRIP_OCCURRENCE_FEED_QUERY_KEY } from '@/modules/trip/queries/tripOccurrenceFeed.query'

import {
  createOccurrenceConversationClient,
  type OccurrenceConversationClient,
} from '../shared/occurrenceConversationClient.service'
import { uploadConversationAttachments } from '../shared/conversationAttachment.service'
import type { ContractorMailRequest } from '../shared/occurrenceConversation.types'

/**
 * Spec 183 T702b: a mensagem com anexo. `uploaded` é do rascunho — o reenvio depois de uma falha
 * não sobe de novo o que já subiu, e a chave da mensagem continua batendo com os mesmos ids.
 */
export type ConversationMessageDraft = Readonly<{
  body: string
  files: readonly File[]
  idempotencyKey: string
  uploaded: Map<File, string>
}>

async function sendWithAttachments(
  client: OccurrenceConversationClient,
  input: ConversationMessageDraft & {
    occurrenceId: string
    participant: 'contractor' | 'driver'
  },
): Promise<void> {
  const channel = input.participant === 'driver' ? 'app' : 'portal'
  const attachmentIds = await uploadConversationAttachments({
    files: input.files,
    putFile: (upload) => client.putConversationUpload(upload),
    requestUpload: (declared) =>
      client.requestConversationUpload({
        ...declared,
        channel,
        occurrenceId: input.occurrenceId,
        participant: input.participant,
      }),
    uploaded: input.uploaded,
  })
  const message = {
    attachmentIds,
    body: input.body,
    idempotencyKey: input.idempotencyKey,
    occurrenceId: input.occurrenceId,
  }
  if (channel === 'app') await client.sendDriverAppMessage(message)
  else await client.sendContractorPortalMessage(message)
}

export const OCCURRENCE_CONVERSATIONS_QUERY_KEY = 'occurrence-conversations'

export function getOccurrenceConversationClient(): OccurrenceConversationClient {
  return createOccurrenceConversationClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

export function useOccurrenceConversationsQuery(
  input: Readonly<{ companyId?: string; enabled: boolean; occurrenceId: string }>,
) {
  const client = getOccurrenceConversationClient()
  return useQuery({
    enabled: input.enabled,
    queryFn: () => client.listConversations({ occurrenceId: input.occurrenceId }),
    queryKey: [OCCURRENCE_CONVERSATIONS_QUERY_KEY, input.companyId, input.occurrenceId],
  })
}

/**
 * Marcar como lida mexe no contador da aba e na coluna Conversa da listagem (RF4, RF15): as duas
 * leituras voltam a ser buscadas.
 */
export function useMarkConversationReadMutation() {
  const queryClient = useQueryClient()
  const client = getOccurrenceConversationClient()
  return useMutation({
    mutationFn: (conversationId: string) => client.markConversationRead({ conversationId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [OCCURRENCE_CONVERSATIONS_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [TRIP_OCCURRENCE_FEED_QUERY_KEY] })
    },
  })
}

export function useContractorMailPreviewMutation(occurrenceId: string) {
  const client = getOccurrenceConversationClient()
  return useMutation({
    mutationFn: (input: Readonly<{ body?: string; subject?: string }>) =>
      client.previewContractorMail({ ...input, occurrenceId }),
  })
}

export function useSendContractorMailMutation(occurrenceId: string) {
  const queryClient = useQueryClient()
  const client = getOccurrenceConversationClient()
  return useMutation({
    mutationFn: (input: Readonly<{ idempotencyKey: string; request: ContractorMailRequest }>) =>
      client.sendContractorMail({ ...input, occurrenceId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [OCCURRENCE_CONVERSATIONS_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [TRIP_OCCURRENCE_FEED_QUERY_KEY] })
    },
  })
}

/** Spec 183 T654 (RF21): à contratante pelo portal; a conversa e a listagem voltam a ser lidas. */
export function useSendContractorPortalMessageMutation(occurrenceId: string) {
  const queryClient = useQueryClient()
  const client = getOccurrenceConversationClient()
  return useMutation({
    mutationFn: (input: ConversationMessageDraft) =>
      sendWithAttachments(client, { ...input, occurrenceId, participant: 'contractor' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [OCCURRENCE_CONVERSATIONS_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [TRIP_OCCURRENCE_FEED_QUERY_KEY] })
    },
  })
}

export const OCCURRENCE_UNASSIGNED_QUERY_KEY = 'occurrence-conversation-unassigned'

export function useUnassignedMessagesQuery(
  input: Readonly<{ companyId?: string; enabled: boolean }>,
) {
  const client = getOccurrenceConversationClient()
  return useQuery({
    enabled: input.enabled,
    queryFn: () => client.listUnassigned(),
    queryKey: [OCCURRENCE_UNASSIGNED_QUERY_KEY, input.companyId],
  })
}

/** Atribuir tira da fila e põe na conversa: as duas leituras (e a coluna Conversa) voltam. */
export function useAssignUnassignedMutation() {
  const queryClient = useQueryClient()
  const client = getOccurrenceConversationClient()
  return useMutation({
    mutationFn: (input: Readonly<{ conversationId: string; unassignedId: string }>) =>
      client.assignUnassigned(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [OCCURRENCE_UNASSIGNED_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [OCCURRENCE_CONVERSATIONS_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [TRIP_OCCURRENCE_FEED_QUERY_KEY] })
    },
  })
}

export function useSendDriverAppMessageMutation(occurrenceId: string) {
  const queryClient = useQueryClient()
  const client = getOccurrenceConversationClient()
  return useMutation({
    mutationFn: (input: ConversationMessageDraft) =>
      sendWithAttachments(client, { ...input, occurrenceId, participant: 'driver' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [OCCURRENCE_CONVERSATIONS_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [TRIP_OCCURRENCE_FEED_QUERY_KEY] })
    },
  })
}
