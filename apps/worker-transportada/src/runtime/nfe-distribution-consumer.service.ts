/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  RabbitMqConsumer,
  RabbitMqDisposition,
  RabbitMqProvider,
} from '@adatechnology/rabbitmq-provider'

import {
  NFE_PROCESSING_EVENT_TYPE,
  nfeProcessingEnvelopeV1Schema,
  type NfeProcessingEnvelopeV1,
} from '../messaging/nfe-processing-envelope.schema.js'
import { safeLogError, safeLogInfo } from '../logging/safe-logger.service.js'
import type { WorkerEnvironment, WorkerLogger } from '../shared/worker.types.js'

export async function startNfeDistributionConsumer(params: {
  readonly config: WorkerEnvironment
  readonly logger: WorkerLogger
  readonly provider: RabbitMqProvider
}): Promise<RabbitMqConsumer> {
  return params.provider.consume<NfeProcessingEnvelopeV1>({
    decode: (value) => nfeProcessingEnvelopeV1Schema.parse(value),
    handler: async ({ payload }) =>
      handleDistributionEnvelope({ envelope: payload, logger: params.logger }),
    prefetch: params.config.prefetch,
  })
}

async function handleDistributionEnvelope(params: {
  readonly envelope: NfeProcessingEnvelopeV1
  readonly logger: WorkerLogger
}): Promise<RabbitMqDisposition> {
  if (params.envelope.type !== NFE_PROCESSING_EVENT_TYPE.DISTRIBUTION_REQUESTED) {
    safeLogError({
      logger: params.logger,
      message: 'nfe_distribution_consumer_unexpected_event_type',
      metadata: {
        eventId: params.envelope.eventId,
        type: params.envelope.type,
      },
    })
    return { type: 'dead-letter' }
  }

  safeLogInfo({
    logger: params.logger,
    message: 'nfe_distribution_consumer_received',
    metadata: {
      companyId: params.envelope.companyId,
      eventId: params.envelope.eventId,
      importId: params.envelope.payload.importId,
    },
  })

  return { type: 'ack' }
}
