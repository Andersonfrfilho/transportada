/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqConsumer, RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import {
  handlePasswordResetDelivery,
  type PasswordResetDeliveryDependencies,
} from '../identity/application/deliver-password-reset-code.service.js'
import {
  passwordResetDeliveryEnvelopeV1Schema,
  type PasswordResetDeliveryEnvelopeV1,
} from '../messaging/password-reset-delivery-envelope.schema.js'
import { safeLogError, safeLogInfo } from '../logging/safe-logger.service.js'
import type { WorkerEnvironment, WorkerLogger } from '../shared/worker.types.js'

/**
 * Idempotência é a própria linha do pedido: `delivered_at` já preenchido faz a reentrega ser
 * inofensiva, e falha de transporte devolve `retry` sem tocar na validade do código.
 */
export async function startPasswordResetDeliveryConsumer(params: {
  readonly config: WorkerEnvironment
  readonly dependencies: PasswordResetDeliveryDependencies
  readonly logger: WorkerLogger
  readonly provider: RabbitMqProvider
}): Promise<RabbitMqConsumer> {
  return params.provider.consume<PasswordResetDeliveryEnvelopeV1>({
    decode: (value) => passwordResetDeliveryEnvelopeV1Schema.parse(value),
    handler: async ({ payload }) => {
      safeLogInfo({
        logger: params.logger,
        message: 'password_reset_delivery_consumer_received',
        metadata: {
          companyId: payload.companyId,
          eventId: payload.eventId,
          requestId: payload.payload.requestId,
        },
      })

      try {
        await handlePasswordResetDelivery(payload, params.dependencies)
        return { type: 'ack' }
      } catch {
        safeLogError({
          logger: params.logger,
          message: 'password_reset_delivery_consumer_failed',
          metadata: {
            companyId: payload.companyId,
            eventId: payload.eventId,
            requestId: payload.payload.requestId,
          },
        })
        return { type: 'retry' }
      }
    },
    prefetch: params.config.prefetch,
  })
}
