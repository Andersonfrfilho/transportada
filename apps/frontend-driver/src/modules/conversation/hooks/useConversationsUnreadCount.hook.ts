/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { useDriverSession } from '@/modules/driver-trip/hooks/useDriverSession.hook'

import {
  UNREAD_CONVERSATIONS_QUERY_KEY,
  UNREAD_CONVERSATIONS_REFETCH_INTERVAL_MS,
} from '../shared/driverConversation.constant'
import { getDriverConversationsApi } from '../shared/driverConversationsApiInstance.service'

const UNREAD_CONVERSATIONS_STALE_TIME_MS = 30 * 1000

/** O selo da aba: soma de `unreadCount` da lista, revalidada ao voltar o foco. Sem rede, nem pergunta. */
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
    enabled: canSync,
    queryFn: async () => {
      const page = await getDriverConversationsApi().listConversations()
      return page.data.reduce((total, conversation) => total + conversation.unreadCount, 0)
    },
    queryKey: UNREAD_CONVERSATIONS_QUERY_KEY,
    refetchInterval: UNREAD_CONVERSATIONS_REFETCH_INTERVAL_MS,
    staleTime: UNREAD_CONVERSATIONS_STALE_TIME_MS,
  })
  return data ?? 0
}
