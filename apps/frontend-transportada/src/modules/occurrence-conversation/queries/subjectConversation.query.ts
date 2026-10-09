/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { uploadConversationAttachments } from '../shared/conversationAttachment.service'
import { getSubjectConversationClient } from '../shared/subjectConversationClient.provider'
import type { SubjectConversationRef } from '../shared/subjectConversation.types'

export const SUBJECT_CONVERSATIONS_QUERY_KEY = 'subject-conversations'
export const SUBJECT_MESSAGES_QUERY_KEY = 'subject-conversation-messages'

/** Spec 260 T3.2: a conversa se relê a cada 15 s enquanto a aba está visível (o app do motorista faz o mesmo). */
export const SUBJECT_CONVERSATION_REFETCH_MS = 15_000

/**
 * A lista da viagem. Só quem acompanha a conversa liga o intervalo (`poll`): o botão de cada nota
 * lê a mesma chave sem criar um relógio por botão.
 */
export function useSubjectConversationsQuery(
  input: Readonly<{ companyId?: string; enabled: boolean; poll: boolean; tripId: string }>,
) {
  const client = getSubjectConversationClient()
  return useQuery({
    enabled: input.enabled,
    queryFn: () => client.listConversations({ tripId: input.tripId }),
    queryKey: [SUBJECT_CONVERSATIONS_QUERY_KEY, input.companyId, input.tripId],
    ...(input.poll
      ? {
          refetchInterval: SUBJECT_CONVERSATION_REFETCH_MS,
          refetchOnWindowFocus: 'always' as const,
        }
      : {}),
  })
}

export function useSubjectMessagesQuery(
  input: Readonly<{ companyId?: string; enabled: boolean; subject: SubjectConversationRef }>,
) {
  const client = getSubjectConversationClient()
  const { subjectId, subjectType, tripId } = input.subject
  return useQuery({
    enabled: input.enabled,
    queryFn: () => client.listMessages(input.subject),
    queryKey: [SUBJECT_MESSAGES_QUERY_KEY, input.companyId, tripId, subjectType, subjectId],
    refetchInterval: SUBJECT_CONVERSATION_REFETCH_MS,
    refetchOnWindowFocus: 'always',
  })
}

function useInvalidateSubjectConversations(): () => void {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: [SUBJECT_CONVERSATIONS_QUERY_KEY] })
    void queryClient.invalidateQueries({ queryKey: [SUBJECT_MESSAGES_QUERY_KEY] })
  }
}

/** Abrir é idempotente e também reabre a que o escritório encerrou (api-contract). */
export function useOpenSubjectConversationMutation() {
  const client = getSubjectConversationClient()
  const invalidate = useInvalidateSubjectConversations()
  return useMutation({
    mutationFn: (subject: SubjectConversationRef) => client.openConversation(subject),
    onSuccess: invalidate,
  })
}

export function useCloseSubjectConversationMutation() {
  const client = getSubjectConversationClient()
  const invalidate = useInvalidateSubjectConversations()
  return useMutation({
    mutationFn: (subject: SubjectConversationRef) => client.closeConversation(subject),
    onSuccess: invalidate,
  })
}

/** Marcar lida mexe só nos contadores: a lista volta a ser lida, as mensagens não. */
export function useMarkSubjectReadMutation() {
  const queryClient = useQueryClient()
  const client = getSubjectConversationClient()
  return useMutation({
    mutationFn: (subject: SubjectConversationRef) => client.markRead(subject),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [SUBJECT_CONVERSATIONS_QUERY_KEY] })
    },
  })
}

/**
 * Mesma ideia da 183 T702b: `uploaded` é do rascunho — o reenvio depois de uma falha não sobe de novo o
 * que já subiu, e a chave da mensagem continua batendo com os mesmos ids.
 */
export type SubjectMessageDraft = Readonly<{
  body: string
  files: readonly File[]
  idempotencyKey: string
  uploaded: Map<File, string>
}>

export function useSendSubjectMessageMutation(subject: SubjectConversationRef) {
  const client = getSubjectConversationClient()
  const invalidate = useInvalidateSubjectConversations()
  return useMutation({
    mutationFn: async (draft: SubjectMessageDraft) => {
      const attachmentIds = await uploadConversationAttachments({
        files: draft.files,
        putFile: (upload) => client.putUpload(upload),
        requestUpload: (declared) => client.requestUpload({ ...subject, ...declared }),
        uploaded: draft.uploaded,
      })
      await client.sendMessage({
        ...subject,
        attachmentIds,
        body: draft.body,
        idempotencyKey: draft.idempotencyKey,
      })
    },
    onSuccess: invalidate,
  })
}
