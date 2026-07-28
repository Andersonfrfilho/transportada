/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqConsumer, RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import {
  CTE_PROCESSING_EVENT_TYPE,
  cteProcessingEnvelopeV1Schema,
  type CteProcessingEnvelopeV1,
} from '../messaging/cte-processing-envelope.schema.js'
import {
  CteIssuanceWorkerMessageHandler,
  type CteRetryPolicyResolver,
} from '../cte-issuance/application/cte-issuance-worker-message-handler.service.js'
import { safeLogError, safeLogInfo } from '../logging/safe-logger.service.js'
import type { WorkerEnvironment, WorkerLogger } from '../shared/worker.types.js'

type CteIssuanceMessageKey = {
  readonly attemptId: string
  readonly batchItemId: string
  readonly companyId: string
  readonly eventId: string
}

type CteIssuanceWorkerRepository = {
  hasProcessed(params: CteIssuanceMessageKey): Promise<boolean>
  markDeadLettered(params: CteIssuanceMessageKey & { readonly reason: string }): Promise<void>
  markProcessed(params: CteIssuanceMessageKey): Promise<void>
  scheduleRetry(
    params: CteIssuanceMessageKey & { readonly attempt: number; readonly nextAttemptAt: Date },
  ): Promise<void>
}

type CteIssuanceConsumerEffect = {
  execute(params: { readonly envelope: CteProcessingEnvelopeV1 }): Promise<void>
}

export async function startCteIssuanceConsumer(params: {
  readonly config: WorkerEnvironment
  readonly effect: CteIssuanceConsumerEffect
  readonly logger: WorkerLogger
  readonly provider: RabbitMqProvider
  readonly repository: CteIssuanceWorkerRepository
  readonly retryPolicyResolver: CteRetryPolicyResolver
}): Promise<RabbitMqConsumer> {
  const handler = new CteIssuanceWorkerMessageHandler({
    clock: { now: () => new Date() },
    effect: params.effect,
    repository: params.repository,
    retryPolicyResolver: params.retryPolicyResolver,
  })

  return params.provider.consume<CteProcessingEnvelopeV1>({
    decode: (value) => cteProcessingEnvelopeV1Schema.parse(value),
    handler: async ({ payload, retryCount }) => {
      const attempt = typeof retryCount === 'number' ? retryCount : 0

      if (
        payload.type !== CTE_PROCESSING_EVENT_TYPE.ITEM_ISSUE_REQUESTED &&
        payload.type !== CTE_PROCESSING_EVENT_TYPE.ITEM_CANCEL_REQUESTED
      ) {
        safeLogError({
          logger: params.logger,
          message: 'cte_issuance_unexpected_event_type',
          metadata: {
            eventId: payload.eventId,
            type: payload.type,
          },
        })
        return { type: 'dead-letter' }
      }

      safeLogInfo({
        logger: params.logger,
        message: 'cte_issuance_consumer_received',
        metadata: {
          attemptId: payload.payload.attemptId,
          batchId: payload.payload.batchId,
          batchItemId: payload.payload.batchItemId,
          companyId: payload.companyId,
          eventId: payload.eventId,
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
