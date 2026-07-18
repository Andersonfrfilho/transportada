/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqConsumer, RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import {
  syntheticMessageEnvelopeV1Schema,
  type SyntheticMessageEnvelopeV1,
} from '../messaging/message-envelope.schema.js'
import { WorkerMessageHandler } from '../messaging/message-handler.service.js'
import { safeLogInfo } from '../logging/safe-logger.service.js'
import type { WorkerEnvironment, WorkerLogger } from '../shared/worker.types.js'

export async function startFoundationSyntheticConsumer(params: {
  readonly config: WorkerEnvironment
  readonly logger: WorkerLogger
  readonly provider: RabbitMqProvider
}): Promise<RabbitMqConsumer | undefined> {
  if (!params.config.foundationSyntheticConsumerEnabled) {
    return undefined
  }

  const processed = new Set<string>()
  const handler = new WorkerMessageHandler({
    effect: {
      async execute() {
        safeLogInfo({
          logger: params.logger,
          message: 'foundation_synthetic_effect_started',
        })
        await Bun.sleep(params.config.foundationSyntheticEffectDelayMs)
        safeLogInfo({
          logger: params.logger,
          message: 'foundation_synthetic_effect_completed',
        })
      },
    },
    idempotency: {
      async isProcessed(idempotencyParams: { eventId: string }) {
        return processed.has(idempotencyParams.eventId)
      },
      async markProcessed(idempotencyParams: { eventId: string }) {
        processed.add(idempotencyParams.eventId)
      },
    },
  })

  return params.provider.consume<SyntheticMessageEnvelopeV1>({
    decode: (value) => syntheticMessageEnvelopeV1Schema.parse(value),
    handler: ({ payload }) => handler.handle(payload),
    prefetch: params.config.prefetch,
  })
}
