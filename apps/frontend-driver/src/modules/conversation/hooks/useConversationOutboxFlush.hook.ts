/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect } from 'react'

import { scheduleQueueDrainTriggers } from '@/modules/driver-trip/shared/pendingQueue.service'

import { getDriverConversationsApi } from '../shared/driverConversationsApiInstance.service'

type DrainEventType = 'online' | 'pageshow' | 'visibilitychange'

const BROWSER_DRAIN_TARGET = {
  addEventListener: (type: DrainEventType, listener: () => void) =>
    (type === 'visibilitychange' ? document : window).addEventListener(type, listener),
  clearInterval: (id: number) => window.clearInterval(id),
  isVisible: () => document.visibilityState === 'visible',
  removeEventListener: (type: DrainEventType, listener: () => void) =>
    (type === 'visibilitychange' ? document : window).removeEventListener(type, listener),
  setInterval: (handler: () => void, timeout: number) => window.setInterval(handler, timeout),
}

/**
 * Esvazia a fila de mensagens nos mesmos gatilhos da fila de eventos (abertura, `online`, foco,
 * `pageshow` e o relógio de 30 s enquanto houver o que mandar). Montado na casca, não na tela de
 * conversas: a mensagem digitada sem sinal tem de sair mesmo com o motorista na tela da viagem.
 */
export function useConversationOutboxFlush(isEnabled: boolean): void {
  useEffect(() => {
    if (!isEnabled) return undefined
    const api = getDriverConversationsApi()
    let queuedCount = 0
    let syncTimer: () => void = () => undefined

    function refreshCount(): void {
      api.outbox
        .listPending()
        .then((pending) => {
          queuedCount = pending.filter((message) => message.state === 'queued').length
          syncTimer()
        })
        .catch(() => undefined)
    }

    function drain(origin: 'immediate' | 'timer'): void {
      api.flushOutbox(origin).catch(() => undefined)
    }

    drain('immediate')
    refreshCount()
    const unsubscribe = api.outbox.subscribe((event) => {
      if (event.type === 'pending-changed') refreshCount()
    })
    const cancelTriggers = scheduleQueueDrainTriggers({
      drain,
      getDrainable: () => queuedCount,
      onQueueSync: (sync) => {
        syncTimer = sync
      },
      target: BROWSER_DRAIN_TARGET,
    })
    return () => {
      unsubscribe()
      cancelTriggers()
    }
  }, [isEnabled])
}
