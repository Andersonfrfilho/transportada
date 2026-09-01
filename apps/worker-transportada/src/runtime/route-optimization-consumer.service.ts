/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqConsumer, RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import { safeLogError, safeLogInfo } from '../logging/safe-logger.service.js'
import type { WorkerLogger } from '../shared/worker.types.js'
import {
  handleRouteOptimization,
  type RouteOptimizationHandlerPorts,
  type RouteOptimizationJob,
} from '../routing/application/route-optimization-handler.service.js'

/** Uma sugestão por vez: o solver é CPU-bound, e paralelizar aqui só disputa o mesmo núcleo. */
const ROUTE_OPTIMIZATION_PREFETCH = 1

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

export async function startRouteOptimizationConsumer(params: {
  readonly logger: WorkerLogger
  readonly maxAttempts: number
  readonly ports: RouteOptimizationHandlerPorts
  readonly provider: RabbitMqProvider
}): Promise<RabbitMqConsumer> {
  return params.provider.consume<RouteOptimizationJob>({
    decode: decodeRouteOptimizationJob,
    async handler({ payload, retryCount }) {
      const attempt = typeof retryCount === 'number' ? retryCount + 1 : 1

      try {
        const disposition = await handleRouteOptimization({
          attempt,
          job: payload,
          maxAttempts: params.maxAttempts,
          ports: params.ports,
        })

        /**
         * O log carrega `suggestionId` e `correlationId` — identificadores opacos. **Nenhum
         * endereço** (`security.md` §1): eles são o dado pessoal que esta feature manipula, e a
         * trilha se faz por referência.
         */
        safeLogInfo({
          logger: params.logger,
          message: 'route_optimization_handled',
          metadata: { attempt, disposition, suggestionId: payload.suggestionId },
        })

        return disposition === 'retry' ? { type: 'retry' } : { type: 'ack' }
      } catch (cause) {
        /**
         * O handler já converte falha de otimização em `failed`. Chegar aqui é falha do próprio
         * handler — banco fora, por exemplo —, e aí a mensagem volta: nada foi decidido, e repetir
         * é a única saída que não perde o pedido.
         */
        safeLogError({
          logger: params.logger,
          message: 'route_optimization_handler_failed',
          metadata: {
            attempt,
            reason: cause instanceof Error ? cause.name : 'unknown',
            suggestionId: payload.suggestionId,
          },
        })

        return { type: 'retry' }
      }
    },
    prefetch: ROUTE_OPTIMIZATION_PREFETCH,
  })
}
