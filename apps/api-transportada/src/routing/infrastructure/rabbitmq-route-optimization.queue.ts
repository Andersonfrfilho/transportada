/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import type { RouteOptimizationQueue } from '../application/route-suggestion.use-case.js'

/**
 * O que viaja na fila: **referência, nada mais** (`security.md` §6). Endereço de parada é dado
 * pessoal, e a fila não é lugar de PII — o worker lê o resto do banco pelo `suggestionId`.
 */
export type RouteOptimizationJob = Readonly<{
  companyId: string
  correlationId: string
  suggestionId: string
}>

export function decodeRouteOptimizationJob(value: unknown): RouteOptimizationJob {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('route optimization payload is not an object')
  }

  const { companyId, correlationId, suggestionId } = value as Record<string, unknown>
  const isJob =
    typeof companyId === 'string' &&
    typeof correlationId === 'string' &&
    typeof suggestionId === 'string'

  if (!isJob) throw new TypeError('route optimization payload is missing required references')

  return { companyId, correlationId, suggestionId }
}

/**
 * O `bootstrap()` da API é síncrono e abrir conexão não é — mesmo arranjo da fila de notificação: a
 * conexão nasce no primeiro pedido, e a promessa memorizada impede dois pedidos simultâneos abrirem
 * dois canais.
 */
export function createLazyRabbitMqRouteOptimizationQueue(params: {
  readonly connect: () => Promise<RabbitMqProvider>
}): RouteOptimizationQueue & { readonly close: () => Promise<void> } {
  let connected: Promise<RabbitMqProvider> | undefined

  function resolveProvider(): Promise<RabbitMqProvider> {
    connected ??= params.connect()
    return connected
  }

  return {
    async close() {
      if (connected === undefined) return
      await (await connected).close()
    },

    async publish(job) {
      const provider = await resolveProvider()
      await provider.publish(job, {
        correlationId: job.correlationId,
        messageId: job.suggestionId,
      })
    },
  }
}
