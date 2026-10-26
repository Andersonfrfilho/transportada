/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect } from 'react'

import { scheduleQueueDrainTriggers } from '@/modules/driver-trip/shared/pendingQueue.service'

import { getClientBoletoEmailRuntime } from '../shared/clientBoletoEmailInstance.service'

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
 * Esvazia a fila do "Enviar ao cliente" nos mesmos gatilhos da fila de mensagens (abertura, `online`, foco,
 * `pageshow` e o relógio de 30 s enquanto houver o que mandar). Montado na casca: o envio feito sem sinal
 * tem de sair mesmo com o motorista em outra tela.
 */
export function useClientEmailOutboxFlush(isEnabled: boolean): void {
  useEffect(() => {
    if (!isEnabled) return undefined
    const { outbox } = getClientBoletoEmailRuntime()
    let queuedCount = 0
    let syncTimer: () => void = () => undefined

    function refreshCount(): void {
      outbox
        .listPending()
        .then((pending) => {
          queuedCount = pending.filter((item) => item.state === 'queued').length
          syncTimer()
        })
        .catch(() => undefined)
    }

    function drain(origin: 'immediate' | 'timer'): void {
      outbox.flush(origin).catch(() => undefined)
    }

    drain('immediate')
    refreshCount()
    const unsubscribe = outbox.subscribe(refreshCount)
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
