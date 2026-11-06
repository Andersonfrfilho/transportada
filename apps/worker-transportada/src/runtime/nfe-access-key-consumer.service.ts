/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqConsumer, RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import { safeLogError } from '../logging/safe-logger.service.js'
import {
  nfeAccessKeyEnvelopeV1Schema,
  type NfeAccessKeyEnvelopeV1,
} from '../messaging/nfe-access-key-envelope.schema.js'
import type { ProcessAccessKeyLookupUseCase } from '../nfe-access-key-lookup/application/process-access-key-lookup.types.js'
import type { WorkerLogger } from '../shared/worker.types.js'

/** ⚠️ `prefetch` 1: o orçamento da SEFAZ é de 15 consultas por hora; paralelismo não ajuda. */
const NFE_ACCESS_KEY_PREFETCH = 1

export async function startNfeAccessKeyConsumer(params: {
  readonly logger: WorkerLogger
  /** O `maxRetries` da topologia: na tentativa que o atinge, a mensagem vai para a fila morta. */
  readonly maxRetries: number
  readonly provider: RabbitMqProvider
  readonly useCase: ProcessAccessKeyLookupUseCase
}): Promise<RabbitMqConsumer> {
  return params.provider.consume<NfeAccessKeyEnvelopeV1>({
    decode: (value) => nfeAccessKeyEnvelopeV1Schema.parse(value),
    handler: async ({ payload, retryCount }) => {
      try {
        await params.useCase.execute(payload)
        return { type: 'ack' }
      } catch (error: unknown) {
        safeLogError({
          logger: params.logger,
          message: 'nfe_access_key_consumer_failed',
          metadata: {
            companyId: payload.companyId,
            eventId: payload.eventId,
            lookupId: payload.payload.lookupId,
            reason: error instanceof Error ? error.name : 'unknown',
          },
        })
        if (retryCount < params.maxRetries) return { type: 'retry' }
        // Sem fechar, a busca ficaria `querying` e o índice de busca ativa travaria a chave
        await params.useCase.abandon(payload).catch(() => undefined)
        return { type: 'dead-letter' }
      }
    },
    prefetch: NFE_ACCESS_KEY_PREFETCH,
  })
}
