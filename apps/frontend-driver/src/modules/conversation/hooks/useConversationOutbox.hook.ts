/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantPendingMessage } from '@adatechnology/conversations-ui/participant'
import { useEffect, useState } from 'react'

import type { DriverConversationsApi } from '../shared/driverConversationsApi.service'

export type ConversationOutboxView = Readonly<{
  onRetryPending: (clientMessageId: string) => void
  pendingMessages: readonly ParticipantPendingMessage[]
}>

/** A fila durável do aparelho, na forma que o pacote espera (`pendingMessages` + reenvio manual). */
export function useConversationOutbox(api: DriverConversationsApi): ConversationOutboxView {
  const [pendingMessages, setPendingMessages] = useState<readonly ParticipantPendingMessage[]>([])

  useEffect(() => {
    let isCancelled = false

    function refresh(): void {
      api.outbox
        .listPending()
        .then((pending) => {
          if (!isCancelled) setPendingMessages(pending)
        })
        .catch(() => undefined)
    }

    refresh()
    const unsubscribe = api.outbox.subscribe((event) => {
      if (event.type === 'pending-changed') refresh()
    })
    return () => {
      isCancelled = true
      unsubscribe()
    }
  }, [api])

  function handleRetryPending(clientMessageId: string): void {
    api.retryPending(clientMessageId).catch(() => undefined)
  }

  return { onRetryPending: handleRetryPending, pendingMessages }
}
