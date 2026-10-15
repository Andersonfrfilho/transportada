/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { ROUTE_OCCURRENCES_QUERY_KEY } from '@/modules/driver-trip/shared/useDriverRouteOccurrences.query'

import { UNREAD_CONVERSATIONS_QUERY_KEY } from '../shared/driverConversation.constant'
import type { DriverConversationsApi } from '../shared/driverConversationsApi.service'
import type { ReopenRefusalReason } from '../shared/driverConversationReopen.service'

export type DriverConversationReopenView = Readonly<{
  /** A recusa do servidor, só enquanto a conversa em que ela aconteceu segue aberta. */
  refusal: ReopenRefusalReason | undefined
}>

/**
 * Ao enviar a reabertura (ou ser recusada) as ocorrências e a lista são lidas de novo; ao sair da
 * conversa o "Reabrir" tocado e não enviado é desarmado, sem gravar nada.
 */
export function useDriverConversationReopen(input: {
  readonly api: DriverConversationsApi
  readonly selectedKey: string | undefined
}): DriverConversationReopenView {
  const { api, selectedKey } = input
  const queryClient = useQueryClient()
  const [refused, setRefused] = useState<
    Readonly<{ key: string; reason: ReopenRefusalReason }> | undefined
  >(undefined)
  useSyncExternalStore(api.reopen.subscribe, api.reopen.version, () => 0)

  useEffect(() => {
    return api.reopen.subscribeEvents((event) => {
      if (event.type === 'reopen-refused') {
        setRefused({
          key: `${event.subject.subjectType}:${event.subject.subjectId}`,
          reason: event.reason,
        })
      }
      void queryClient.invalidateQueries({ queryKey: ROUTE_OCCURRENCES_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: UNREAD_CONVERSATIONS_QUERY_KEY })
    })
  }, [api, queryClient])

  const isMounted = useRef(false)
  useEffect(() => {
    isMounted.current = true
    api.reopen.keepOnly(selectedKey)
    return () => {
      isMounted.current = false
      // O StrictMode desmonta e remonta na hora: só desarma se a página realmente saiu.
      queueMicrotask(() => {
        if (!isMounted.current) api.reopen.clear()
      })
    }
  }, [api, selectedKey])

  return {
    refusal: refused !== undefined && refused.key === selectedKey ? refused.reason : undefined,
  }
}
