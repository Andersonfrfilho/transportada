/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import type { JobRunEnvelope, JobRunPublisher } from '../application/run-job.port.js'

/**
 * Conexão **preguiçosa**, como as demais filas da API: abrir socket com o broker no arranque faria a
 * API depender do RabbitMQ para subir, e ela atende dezenas de rotas que não passam por fila
 * nenhuma. Quem aperta o botão paga a conexão da primeira vez.
 */
export function createLazyRabbitMqJobRunPublisher(dependencies: {
  readonly connect: () => Promise<RabbitMqProvider>
}): JobRunPublisher {
  let provider: Promise<RabbitMqProvider> | undefined

  return {
    async publish(envelope: JobRunEnvelope): Promise<void> {
      provider ??= dependencies.connect()
      try {
        await (await provider).publish(envelope)
      } catch (cause) {
        /** Conexão que falhou não fica guardada: a tentativa seguinte tem de poder reconectar. */
        provider = undefined
        throw cause
      }
    },
  }
}
