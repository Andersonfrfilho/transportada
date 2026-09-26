/* Copyright (c) 2026 Ada Technology. MIT License. */
import { hasPendingOutboundStatus } from '../shared/messageStatus.service'
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
  /** Spec 183 T702d: anexos da conversa do motorista encaminhados à contratante (só pelo portal). */
  forwardAttachmentIds?: readonly string[]
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
    ...(input.forwardAttachmentIds === undefined
      ? {}
      : { forwardAttachmentIds: input.forwardAttachmentIds }),
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

/** O Resend e a Meta confirmam em segundos; 20 s é folga sem martelar a API. */
const CONVERSATION_STATUS_REFETCH_MS = 20_000
/** Sem status a esperar, só a mensagem nova do outro lado: um minuto basta para conversa humana. */
export const CONVERSATION_IDLE_REFETCH_MS = 60_000

export function useOccurrenceConversationsQuery(
  input: Readonly<{ companyId?: string; enabled: boolean; occurrenceId: string }>,
) {
  const client = getOccurrenceConversationClient()
  return useQuery({
    enabled: input.enabled,
    queryFn: () => client.listConversations({ occurrenceId: input.occurrenceId }),
    queryKey: [OCCURRENCE_CONVERSATIONS_QUERY_KEY, input.companyId, input.occurrenceId],
    /**
     * Spec 183 T703 (P8): o selo muda sozinho — com mensagem que sai ainda podendo avançar, a
     * conversa volta a ser lida a cada 20 s. Spec 183 T902 (D2): mesmo com tudo confirmado, a
     * mensagem nova do outro lado precisa aparecer (e ser anunciada) sem recarregar — a cada 60 s.
     * Aba oculta não lê: o TanStack pausa o intervalo em segundo plano.
     */
    refetchInterval: (query) =>
      query.state.data?.conversations.some((conversation) =>
        hasPendingOutboundStatus(conversation.messages),
      ) === true
        ? CONVERSATION_STATUS_REFETCH_MS
        : CONVERSATION_IDLE_REFETCH_MS,
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
    /**
     * Spec 183 T702e: os arquivos sobem pelo canal e-mail antes do envio; `uploaded` é o do
     * rascunho, para o reenvio depois de uma falha reusar os mesmos ids com a mesma chave.
     */
    mutationFn: async (
      input: Readonly<{
        files: readonly File[]
        idempotencyKey: string
        request: ContractorMailRequest
        uploaded: Map<File, string>
      }>,
    ) => {
      const attachmentIds = await uploadConversationAttachments({
        files: input.files,
        putFile: (upload) => client.putConversationUpload(upload),
        requestUpload: (declared) =>
          client.requestConversationUpload({
            ...declared,
            channel: 'email',
            occurrenceId,
            participant: 'contractor',
          }),
        uploaded: input.uploaded,
      })
      await client.sendContractorMail({
        idempotencyKey: input.idempotencyKey,
        occurrenceId,
        request: { ...input.request, attachmentIds },
      })
    },
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
