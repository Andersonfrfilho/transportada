/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqConsumer, RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import {
  handleCargoLayout,
  type CargoLayoutHandlerPorts,
  type CargoLayoutJob,
} from '../cargo-layout/application/cargo-layout-handler.service.js'
import { safeLogError, safeLogInfo } from '../logging/safe-logger.service.js'
import { cargoLayoutEnvelopeV1Schema } from '../messaging/cargo-layout-envelope.schema.js'
import type { WorkerLogger } from '../shared/worker.types.js'

/** Uma planta por vez: o empacotamento é CPU, e paralelizar aqui só disputa o mesmo núcleo. */
export const CARGO_LAYOUT_PREFETCH = 1

export function decodeCargoLayoutJob(value: unknown): CargoLayoutJob {
  const envelope = cargoLayoutEnvelopeV1Schema.parse(value)

  return {
    companyId: envelope.companyId,
    correlationId: envelope.correlationId,
    inputHash: envelope.payload.inputHash,
    layoutId: envelope.payload.layoutId,
  }
}

export async function startCargoLayoutConsumer(params: {
  readonly baseBudgetMs: number
  readonly logger: WorkerLogger
  readonly maxAttempts: number
  readonly ports: CargoLayoutHandlerPorts
  readonly provider: RabbitMqProvider
}): Promise<RabbitMqConsumer> {
  return params.provider.consume<CargoLayoutJob>({
    decode: decodeCargoLayoutJob,
    async handler({ payload, retryCount }) {
      const attempt = retryCount + 1

      try {
        const disposition = await handleCargoLayout({
          attempt,
          baseBudgetMs: params.baseBudgetMs,
          job: payload,
          logger: params.logger,
          maxAttempts: params.maxAttempts,
          ports: params.ports,
        })

        // Só referência opaca: rótulo de parada e cliente são PII (`security.md` §1)
        safeLogInfo({
          logger: params.logger,
          message: 'cargo_layout_handled',
          metadata: { attempt, disposition, layoutId: payload.layoutId },
        })

        return { type: disposition }
      } catch (cause) {
        // Falha do próprio handler — banco fora na reivindicação: nada foi decidido, a mensagem volta
        safeLogError({
          logger: params.logger,
          message: 'cargo_layout_handler_failed',
          metadata: {
            attempt,
            layoutId: payload.layoutId,
            reason: cause instanceof Error ? cause.name : 'unknown',
          },
        })

        return { type: 'retry' }
      }
    },
    prefetch: CARGO_LAYOUT_PREFETCH,
  })
}
