/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  RabbitMqDisposition,
  RabbitMqMessageHandler,
  RabbitMqProvider,
} from '@adatechnology/rabbitmq-provider'

import type { WorkerEnvironment, WorkerLogger } from '../../src/shared/worker.types.js'

type LoggedEntry = { readonly message: string; readonly metadata: unknown }

/**
 * Um provider que só guarda o `handler`: a disposição que o consumidor devolve é o contrato com o
 * broker, e é ela que se afirma — sem RabbitMQ de verdade.
 */
export function createCapturedConsumer() {
  const handlers: RabbitMqMessageHandler<unknown>[] = []
  const logged: LoggedEntry[] = []

  const provider = {
    async consume<TPayload>(params: { readonly handler: RabbitMqMessageHandler<TPayload> }) {
      handlers.push(params.handler as RabbitMqMessageHandler<unknown>)
      return { cancel: async (): Promise<void> => undefined, consumerTag: 'test' }
    },
  } as unknown as RabbitMqProvider

  const logger: WorkerLogger = {
    error: (message, metadata) => logged.push({ message, metadata }),
    info: (message, metadata) => logged.push({ message, metadata }),
    warn: (message, metadata) => logged.push({ message, metadata }),
  }

  async function deliver(payload: unknown): Promise<RabbitMqDisposition> {
    const handler = handlers[0]
    if (handler === undefined) throw new Error('consumer was not started')
    return handler({ headers: {}, payload, redelivered: false, retryCount: 0 })
  }

  return {
    config: { prefetch: 1 } as WorkerEnvironment,
    deliver,
    logged,
    logger,
    provider,
  }
}
