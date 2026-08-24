/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { QueuePort } from '@adatechnology/notification-contracts'

import { NotificationQueueUnreachableError } from '../domain/notification-queue.error.js'

/**
 * Envolve a fila para que a falha de publicação chegue **nomeada** a quem a lê. Só `enqueue` é
 * tocado: `consume` e `close` são do consumidor, e a rotina agendada nunca passa por eles.
 */
export function createGuardedNotificationQueue(queue: QueuePort): QueuePort {
  return {
    close: () => queue.close(),
    consume: (handler) => queue.consume(handler),
    async enqueue(params) {
      try {
        await queue.enqueue(params)
      } catch (error: unknown) {
        throw new NotificationQueueUnreachableError(error)
      }
    },
  }
}
