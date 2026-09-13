/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqConsumer, RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import {
  contractorMailInboundEnvelopeV1Schema,
  type ContractorMailInboundEnvelopeV1,
} from '../messaging/contractor-mail-inbound-envelope.schema.js'
import {
  recordContractorMailInboundMessage,
  type RecordContractorMailInboundMessageDependencies,
} from '../contractor-mail/application/record-contractor-mail-inbound-message.use-case.js'
import {
  ResendDownloadHostNotAllowedError,
  ResendDownloadRedirectBlockedError,
  ResendDownloadTooLargeError,
  ResendProviderUnauthorizedError,
} from '../contractor-mail/domain/resend-provider.error.js'
import { safeLogError, safeLogInfo } from '../logging/safe-logger.service.js'
import type { WorkerEnvironment, WorkerLogger } from '../shared/worker.types.js'

/**
 * Falhas **permanentes** (RF do Objetivo item 5): a chave foi recusada, ou a `download_url` não é
 * do Resend — reentregar não muda o resultado. Tudo o mais (rede, bucket, DNS do DKIM lento) é
 * transitório e vai para o retry da topologia.
 */
function isPermanentFailure(error: unknown): boolean {
  return (
    error instanceof ResendProviderUnauthorizedError ||
    error instanceof ResendDownloadHostNotAllowedError ||
    error instanceof ResendDownloadRedirectBlockedError ||
    error instanceof ResendDownloadTooLargeError
  )
}

function describePermanentFailure(error: unknown): string {
  if (error instanceof ResendProviderUnauthorizedError) return 'provider_unauthorized'
  if (error instanceof ResendDownloadHostNotAllowedError) return 'download_host_not_allowed'
  if (error instanceof ResendDownloadRedirectBlockedError) return 'download_redirect_blocked'
  if (error instanceof ResendDownloadTooLargeError) return 'download_too_large'
  return 'unknown'
}

/**
 * Observabilidade (plan.md): `inbound_email_token_unknown` é só contador — nunca carrega o
 * endereço, o assunto, o corpo ou o token. `inbound_email_dkim_verified` leva o resultado do DKIM,
 * nunca o conteúdo. Nenhum log daqui leva PII (§1 do baseline de segurança).
 */
export async function startContractorMailInboundConsumer(params: {
  readonly config: WorkerEnvironment
  readonly dependencies: RecordContractorMailInboundMessageDependencies
  readonly logger: WorkerLogger
  readonly provider: RabbitMqProvider
}): Promise<RabbitMqConsumer> {
  return params.provider.consume<ContractorMailInboundEnvelopeV1>({
    decode: (value) => contractorMailInboundEnvelopeV1Schema.parse(value),
    handler: async ({ payload }) => {
      const baseMetadata = { companyId: payload.companyId, eventId: payload.eventId }

      try {
        const result = await recordContractorMailInboundMessage(payload, params.dependencies)

        if (result.outcome === 'discarded') {
          safeLogInfo({
            logger: params.logger,
            message: 'inbound_email_token_unknown',
            metadata: baseMetadata,
          })
          return { type: 'ack' }
        }
        if (result.outcome === 'recorded') {
          safeLogInfo({
            logger: params.logger,
            message: 'inbound_email_dkim_verified',
            metadata: { ...baseMetadata, dkimResult: result.dkimResult, threadId: result.threadId },
          })
        }
        return { type: 'ack' }
      } catch (error: unknown) {
        if (isPermanentFailure(error)) {
          safeLogError({
            logger: params.logger,
            message: 'inbound_email_webhook_rejected',
            metadata: { ...baseMetadata, reason: describePermanentFailure(error) },
          })
          return { type: 'ack' }
        }

        safeLogError({
          logger: params.logger,
          message: 'inbound_email_webhook_rejected',
          metadata: { ...baseMetadata, reason: 'transient' },
        })
        return { type: 'retry' }
      }
    },
    prefetch: params.config.prefetch,
  })
}
