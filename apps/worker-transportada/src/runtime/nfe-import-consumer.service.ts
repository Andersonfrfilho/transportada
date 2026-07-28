/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqConsumer, RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import {
  NfeImportWorkerMessageHandler,
  type NfeImportWorkerEffect,
  type NfeImportWorkerRepository,
} from '../nfe-imports/application/nfe-import-worker-message-handler.service.js'
import {
  NFE_PROCESSING_EVENT_TYPE,
  nfeProcessingEnvelopeV1Schema,
  type NfeProcessingEnvelopeV1,
} from '../messaging/nfe-processing-envelope.schema.js'
import { NFE_IMPORT_BACKOFF_ATTEMPTS_MS } from '../messaging/nfe-backoff-policy.js'
import { safeLogError, safeLogInfo } from '../logging/safe-logger.service.js'
import type { WorkerEnvironment, WorkerLogger } from '../shared/worker.types.js'

export async function startNfeImportConsumer(params: {
  readonly config: WorkerEnvironment
  readonly effect: NfeImportWorkerEffect
  readonly logger: WorkerLogger
  readonly provider: RabbitMqProvider
  readonly repository: NfeImportWorkerRepository
}): Promise<RabbitMqConsumer> {
  const handler = new NfeImportWorkerMessageHandler({
    clock: { now: () => new Date() },
    effect: params.effect,
    maxAttempts: NFE_IMPORT_BACKOFF_ATTEMPTS_MS.length,
    repository: params.repository,
  })

  return params.provider.consume<NfeProcessingEnvelopeV1>({
    decode: (value) => nfeProcessingEnvelopeV1Schema.parse(value),
    handler: async ({ payload, retryCount }) => {
      const attempt = typeof retryCount === 'number' ? retryCount : 0

      if (payload.type !== NFE_PROCESSING_EVENT_TYPE.IMPORT_REQUESTED) {
        safeLogError({
          logger: params.logger,
          message: 'nfe_import_consumer_unexpected_event_type',
          metadata: {
            eventId: payload.eventId,
            type: payload.type,
          },
        })
        return { type: 'dead-letter' }
      }

      safeLogInfo({
        logger: params.logger,
        message: 'nfe_import_consumer_received',
        metadata: {
          companyId: payload.companyId,
          eventId: payload.eventId,
          importId: payload.payload.importId,
        },
      })

      return handler.handle({
        attempt,
        envelope: payload,
      })
    },
    prefetch: params.config.prefetch,
  })
}
