/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqConsumer, RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import {
  handleInvitationDelivery,
  type InvitationDeliveryDependencies,
} from '../identity/application/deliver-invitation-code.service.js'
import {
  invitationDeliveryEnvelopeV1Schema,
  type InvitationDeliveryEnvelopeV1,
} from '../messaging/invitation-delivery-envelope.schema.js'
import { safeLogError, safeLogInfo } from '../logging/safe-logger.service.js'
import type { WorkerEnvironment, WorkerLogger } from '../shared/worker.types.js'

/**
 * Idempotência é a própria linha do convite: `delivered_at` já preenchido faz a reentrega ser
 * inofensiva, e falha de transporte devolve `retry` sem tocar na validade do código.
 */
export async function startInvitationDeliveryConsumer(params: {
  readonly config: WorkerEnvironment
  readonly dependencies: InvitationDeliveryDependencies
  readonly logger: WorkerLogger
  readonly provider: RabbitMqProvider
}): Promise<RabbitMqConsumer> {
  return params.provider.consume<InvitationDeliveryEnvelopeV1>({
    decode: (value) => invitationDeliveryEnvelopeV1Schema.parse(value),
    handler: async ({ payload }) => {
      safeLogInfo({
        logger: params.logger,
        message: 'invitation_delivery_consumer_received',
        metadata: {
          companyId: payload.companyId,
          eventId: payload.eventId,
          invitationId: payload.payload.invitationId,
        },
      })

      try {
        await handleInvitationDelivery(payload, params.dependencies)
        return { type: 'ack' }
      } catch {
        safeLogError({
          logger: params.logger,
          message: 'invitation_delivery_consumer_failed',
          metadata: {
            companyId: payload.companyId,
            eventId: payload.eventId,
            invitationId: payload.payload.invitationId,
          },
        })
        return { type: 'retry' }
      }
    },
    prefetch: params.config.prefetch,
  })
}
