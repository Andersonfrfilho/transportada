/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { QueuePort } from '@adatechnology/notification-contracts'
import {
  createNotificationWorker,
  type NotificationModule,
  type NotificationWorker,
} from '@adatechnology/notification-module'

import { safeLogInfo } from '../logging/safe-logger.service.js'
import type { WorkerLogger } from '../shared/worker.types.js'

type NotificationWorkerFactory = (params: {
  readonly logger?: WorkerLogger
  readonly module: NotificationModule
  readonly queue: QueuePort
}) => NotificationWorker

type StartNotificationConsumerParams = {
  /** Injetável para o contrato observar o ciclo sem abrir conexão nem banco. */
  readonly createWorker?: NotificationWorkerFactory
  readonly logger: WorkerLogger
  readonly module: NotificationModule
  readonly queue: QueuePort
}

/**
 * Quem consome a fila é o worker do próprio módulo: ele conhece a máquina de estados da entrega
 * (tentativa, supressão, recibo) e nós só damos a ele o transporte e o ciclo de vida do processo.
 */
export async function startNotificationConsumer(
  params: StartNotificationConsumerParams,
): Promise<{ cancel(): Promise<void> }> {
  const factory = params.createWorker ?? (createNotificationWorker as NotificationWorkerFactory)
  const worker = factory({
    logger: params.logger,
    module: params.module,
    queue: params.queue,
  })

  await worker.start()
  safeLogInfo({ logger: params.logger, message: 'notification_consumer_started' })

  return {
    // Parar devolve a entrega em voo para a fila, em vez de deixá-la presa em `queued`.
    async cancel() {
      await worker.stop()
    },
  }
}
