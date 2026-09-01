/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqConsumer, RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import {
  extractAttachmentFields,
  type ExtractAttachmentFieldsDependencies,
} from '../aggregate-attachment/application/extract-attachment-fields.use-case.js'
import {
  aggregateAttachmentEnvelopeV1Schema,
  type AggregateAttachmentEnvelopeV1,
} from '../messaging/aggregate-attachment-envelope.schema.js'
import { safeLogError, safeLogInfo } from '../logging/safe-logger.service.js'
import type { WorkerEnvironment, WorkerLogger } from '../shared/worker.types.js'

/**
 * ⚠️ `prefetch` é **1** aqui, e não o do resto do worker: cada mensagem sobe uma `worker_thread` com
 * pdf.js dentro, e o teto de threads simultâneas é o teto de CPU do contêiner. Herdar o prefetch da
 * fila fiscal transformaria uma rajada de anexos — que vem de gente anônima — em dezenas de parses
 * concorrentes, que é exatamente o que a ADR-0053 veio impedir.
 */
const ATTACHMENT_PREFETCH = 1

export async function startAggregateAttachmentConsumer(params: {
  readonly config: WorkerEnvironment
  readonly dependencies: ExtractAttachmentFieldsDependencies
  readonly logger: WorkerLogger
  readonly provider: RabbitMqProvider
}): Promise<RabbitMqConsumer> {
  return params.provider.consume<AggregateAttachmentEnvelopeV1>({
    decode: (value) => aggregateAttachmentEnvelopeV1Schema.parse(value),
    handler: async ({ payload }) => {
      /**
       * O log leva identificador opaco e nada mais: nem a chave do objeto, que carrega o rascunho, nem
       * qualquer campo lido (`security.md` §1).
       */
      const metadata = {
        attachmentId: payload.payload.attachmentId,
        companyId: payload.companyId,
        eventId: payload.eventId,
      }

      try {
        const outcome = await extractAttachmentFields(payload, params.dependencies)
        safeLogInfo({
          logger: params.logger,
          message: `aggregate_attachment_extraction_${outcome}`,
          metadata,
        })
        return { type: 'ack' }
      } catch {
        safeLogError({
          logger: params.logger,
          message: 'aggregate_attachment_extraction_failed',
          metadata,
        })
        return { type: 'retry' }
      }
    },
    prefetch: ATTACHMENT_PREFETCH,
  })
}
