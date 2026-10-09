/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { useDriverSession } from '@/modules/driver-trip/hooks/useDriverSession.hook'

import { conversationDigestsQueryOptions } from '../shared/conversationDigests.query'
import {
  UNREAD_CONVERSATIONS_QUERY_KEY,
  UNREAD_CONVERSATIONS_REFETCH_INTERVAL_MS,
} from '../shared/driverConversation.constant'
import { getDriverConversationsApi } from '../shared/driverConversationsApiInstance.service'

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
    ...conversationDigestsQueryOptions(canSync),
    refetchInterval: UNREAD_CONVERSATIONS_REFETCH_INTERVAL_MS,
    select: (digests) => digests.reduce((total, digest) => total + digest.unreadCount, 0),
  })
  return data ?? 0
}
