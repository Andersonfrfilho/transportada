/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqConsumer, RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import { safeLogError } from '../logging/safe-logger.service.js'
import {
  nfeAccessKeyEnvelopeV1Schema,
  type NfeAccessKeyEnvelopeV1,
} from '../messaging/nfe-access-key-envelope.schema.js'
import { describeLookupErrorForLog } from '../nfe-access-key-lookup/domain/access-key-lookup-error-log.policy.js'
import { NfeAccessKeyLookupNonRetryableError } from '../nfe-access-key-lookup/domain/nfe-access-key-lookup.error.js'
import type { ProcessAccessKeyLookupUseCase } from '../nfe-access-key-lookup/application/process-access-key-lookup.types.js'
import type { WorkerLogger } from '../shared/worker.types.js'

/** ⚠️ `prefetch` 1: o orçamento da SEFAZ é de 15 consultas por hora; paralelismo não ajuda. */
const NFE_ACCESS_KEY_PREFETCH = 1

type ConsumerParams = Parameters<typeof startNfeAccessKeyConsumer>[0]

/** Sem fechar, a busca ficaria `querying` e o índice de busca ativa travaria a chave. */
async function abandonOrRetry(input: {
  readonly hasRetriesLeft: boolean
  readonly metadata: {
    readonly companyId: string
    readonly eventId: string
    readonly lookupId: string
  }
  readonly params: ConsumerParams
  readonly payload: NfeAccessKeyEnvelopeV1
}): Promise<{ readonly type: 'dead-letter' | 'retry' }> {
  try {
    await input.params.useCase.abandon(input.payload)
  } catch (error: unknown) {
    safeLogError({
      logger: input.params.logger,
      message: 'nfe_access_key_abandon_failed',
      metadata: { ...input.metadata, ...describeLookupErrorForLog(error) },
    })
    if (input.hasRetriesLeft) return { type: 'retry' }
  }
  return { type: 'dead-letter' }
}

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
      const metadata = {
        companyId: payload.companyId,
        eventId: payload.eventId,
        lookupId: payload.payload.lookupId,
      }
      try {
        await params.useCase.execute(payload)
        return { type: 'ack' }
      } catch (error: unknown) {
        safeLogError({
          logger: params.logger,
          message: 'nfe_access_key_consumer_failed',
          metadata: { ...metadata, ...describeLookupErrorForLog(error) },
        })
        const hasRetriesLeft = retryCount < params.maxRetries
        // Repetir não muda o resultado de um defeito de dados: sem nova consulta à SEFAZ
        const isRetryable = !(error instanceof NfeAccessKeyLookupNonRetryableError)
        if (isRetryable && hasRetriesLeft) return { type: 'retry' }
        return abandonOrRetry({ hasRetriesLeft, metadata, params, payload })
      }
    },
    prefetch: NFE_ACCESS_KEY_PREFETCH,
  })
}
