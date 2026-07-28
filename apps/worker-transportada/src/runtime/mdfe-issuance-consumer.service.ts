/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqConsumer, RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import {
  MDFE_PROCESSING_EVENT_TYPE,
  mdfeProcessingEnvelopeV1Schema,
  type MdfeProcessingEnvelopeV1,
} from '../messaging/mdfe-processing-envelope.schema.js'
import {
  MdfeIssuanceWorkerMessageHandler,
  type MdfeRetryPolicyResolver,
} from '../mdfe-issuance/application/mdfe-issuance-worker-message-handler.service.js'
import { safeLogError, safeLogInfo } from '../logging/safe-logger.service.js'
import type { WorkerEnvironment, WorkerLogger } from '../shared/worker.types.js'

const SUPPORTED_EVENT_TYPES: readonly string[] = Object.values(MDFE_PROCESSING_EVENT_TYPE)

type MdfeIssuanceMessageKey = {
  readonly attemptId: string
  readonly companyId: string
  readonly eventId: string
  readonly manifestId: string
}

type MdfeIssuanceWorkerRepository = {
  hasProcessed(params: MdfeIssuanceMessageKey): Promise<boolean>
  markDeadLettered(params: MdfeIssuanceMessageKey & { readonly reason: string }): Promise<void>
  markProcessed(params: MdfeIssuanceMessageKey): Promise<void>
  scheduleRetry(
    params: MdfeIssuanceMessageKey & { readonly attempt: number; readonly nextAttemptAt: Date },
  ): Promise<void>
}

type MdfeIssuanceConsumerEffect = {
  execute(params: { readonly envelope: MdfeProcessingEnvelopeV1 }): Promise<void>
}

export async function startMdfeIssuanceConsumer(params: {
  readonly config: WorkerEnvironment
  readonly effect: MdfeIssuanceConsumerEffect
  readonly logger: WorkerLogger
  readonly provider: RabbitMqProvider
  readonly repository: MdfeIssuanceWorkerRepository
  readonly retryPolicyResolver: MdfeRetryPolicyResolver
}): Promise<RabbitMqConsumer> {
  const handler = new MdfeIssuanceWorkerMessageHandler({
    clock: { now: () => new Date() },
    effect: params.effect,
    repository: params.repository,
    retryPolicyResolver: params.retryPolicyResolver,
  })

  return params.provider.consume<MdfeProcessingEnvelopeV1>({
    decode: (value) => mdfeProcessingEnvelopeV1Schema.parse(value),
    handler: async ({ payload, retryCount }) => {
      const attempt = typeof retryCount === 'number' ? retryCount : 0

      if (!SUPPORTED_EVENT_TYPES.includes(payload.type)) {
        safeLogError({
          logger: params.logger,
          message: 'mdfe_issuance_unexpected_event_type',
          metadata: {
            eventId: payload.eventId,
            type: payload.type,
          },
        })
        return { type: 'dead-letter' }
      }

      safeLogInfo({
        logger: params.logger,
        message: 'mdfe_issuance_consumer_received',
        metadata: {
          attemptId: payload.payload.attemptId,
          attemptKind: payload.payload.attemptKind,
          companyId: payload.companyId,
          eventId: payload.eventId,
          manifestId: payload.payload.manifestId,
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
