/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { useDriverSession } from '@/modules/driver-trip/hooks/useDriverSession.hook'

import { conversationDigestsQueryOptions } from '../shared/conversationDigests.query'
import {
  UNREAD_CONVERSATIONS_QUERY_KEY,
  UNREAD_CONVERSATIONS_REFETCH_INTERVAL_MS,
} from '../shared/driverConversation.constant'
import { playConversationChime, shouldChime } from '../shared/conversationChime.service'
import { getDriverConversationsApi } from '../shared/driverConversationsApiInstance.service'

/**
 * O selo da aba: soma de `unreadCount` da lista, revalidada ao voltar o foco. Sem rede, nem pergunta.
 * Quando a soma sobe (mensagem nova), toca um som curto.
 */
export function useConversationsUnreadCount(): number {
  const { canSync } = useDriverSession()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!canSync) return undefined
    return getDriverConversationsApi().subscribe?.((event) => {
      if (event.type !== 'inbox-changed') return
      void queryClient.invalidateQueries({ queryKey: UNREAD_CONVERSATIONS_QUERY_KEY })
    })
  }, [canSync, queryClient])

  const { data } = useQuery({
    ...conversationDigestsQueryOptions(canSync),
    refetchInterval: UNREAD_CONVERSATIONS_REFETCH_INTERVAL_MS,
    select: (digests) => digests.reduce((total, digest) => total + digest.unreadCount, 0),
  })

  const previous = useRef<null | number>(null)
  useEffect(() => {
    if (data === undefined) return
    if (shouldChime(previous.current, data)) playConversationChime()
    previous.current = data
  }, [data])

  return data ?? 0
}
