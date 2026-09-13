/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqConsumer, RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import {
  contractorMailOutboundEnvelopeV1Schema,
  type ContractorMailOutboundEnvelopeV1,
} from '../messaging/contractor-mail-outbound-envelope.schema.js'
import {
  sendContractorMailOutboundMessage,
  type SendContractorMailOutboundMessageDependencies,
} from '../contractor-mail/application/send-contractor-mail-outbound-message.use-case.js'
import { safeLogError, safeLogInfo } from '../logging/safe-logger.service.js'
import type { WorkerEnvironment, WorkerLogger } from '../shared/worker.types.js'

/**
 * Observabilidade (plan.md): `contractor_mail_sent`/`_failed`, sempre com `messageId`, `threadId` e
 * o motivo — nunca endereço, assunto, corpo ou segredo.
 */
export async function startContractorMailOutboundConsumer(params: {
  readonly config: WorkerEnvironment
  readonly dependencies: SendContractorMailOutboundMessageDependencies
  readonly logger: WorkerLogger
  readonly provider: RabbitMqProvider
}): Promise<RabbitMqConsumer> {
  return params.provider.consume<ContractorMailOutboundEnvelopeV1>({
    decode: (value) => contractorMailOutboundEnvelopeV1Schema.parse(value),
    handler: async ({ payload }) => {
      const baseMetadata = { companyId: payload.companyId, eventId: payload.eventId }

      try {
        const result = await sendContractorMailOutboundMessage(payload, params.dependencies)
        const metadata = {
          ...baseMetadata,
          messageId: payload.payload.messageId,
          threadId: result.threadId,
          ...(result.reason === undefined ? {} : { reason: result.reason }),
        }
        safeLogInfo({
          logger: params.logger,
          message: result.outcome === 'sent' ? 'contractor_mail_sent' : 'contractor_mail_failed',
          metadata,
        })
        return { type: 'ack' }
      } catch {
        safeLogError({
          logger: params.logger,
          message: 'contractor_mail_failed',
          metadata: { ...baseMetadata, messageId: payload.payload.messageId, reason: 'transient' },
        })
        return { type: 'retry' }
      }
    },
    prefetch: params.config.prefetch,
  })
}
