/* Copyright (c) 2026 Ada Technology. MIT License. */
import { UNREAD_CONVERSATIONS_QUERY_KEY } from './driverConversation.constant'
import type { KnownConversation } from './openSubjectConversation.service'
import { getDriverConversationsApi } from './driverConversationsApiInstance.service'

export type ConversationDigest = Readonly<
  KnownConversation & { subjectId: string; subjectType: string }
>

const CONVERSATION_DIGESTS_STALE_TIME_MS = 30 * 1000

async function fetchConversationDigests(): Promise<readonly ConversationDigest[]> {
  const page = await getDriverConversationsApi().listConversations()
  return page.data.map((conversation) => ({
    status: conversation.status,
    subjectId: conversation.subjectId,
    subjectType: conversation.subjectType,
    unreadCount: conversation.unreadCount,
  }))
}

/** A única consulta leve da lista: o selo da aba e o selo de cada botão leem a mesma chave, sem segundo polling. */
export function conversationDigestsQueryOptions(canSync: boolean) {
  return {
    enabled: canSync,
    queryFn: fetchConversationDigests,
    queryKey: UNREAD_CONVERSATIONS_QUERY_KEY,
    staleTime: CONVERSATION_DIGESTS_STALE_TIME_MS,
  }
}
