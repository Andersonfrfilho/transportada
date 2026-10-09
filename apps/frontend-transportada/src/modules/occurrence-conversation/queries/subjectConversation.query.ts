/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getSubjectConversationClient } from '../shared/subjectConversationClient.provider'
import type { SubjectConversationRef } from '../shared/subjectConversation.types'

export const SUBJECT_CONVERSATIONS_QUERY_KEY = 'subject-conversations'

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

/** O fio relê sozinho (SDK); o que a tela precisa reler é o resumo — estado, protocolo e não lidas. */
export function useRefreshSubjectConversations(): () => void {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: [SUBJECT_CONVERSATIONS_QUERY_KEY] })
  }
}

/** Abrir é idempotente e também reabre a que o escritório encerrou (api-contract). */
export function useOpenSubjectConversationMutation() {
  const client = getSubjectConversationClient()
  const invalidate = useRefreshSubjectConversations()
  return useMutation({
    mutationFn: (subject: SubjectConversationRef) => client.openConversation(subject),
    onSuccess: invalidate,
  })
}

export function useCloseSubjectConversationMutation() {
  const client = getSubjectConversationClient()
  const invalidate = useRefreshSubjectConversations()
  return useMutation({
    mutationFn: (subject: SubjectConversationRef) => client.closeConversation(subject),
    onSuccess: invalidate,
  })
}
