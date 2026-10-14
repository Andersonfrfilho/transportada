/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 265 RF5-RF8, RF13: o consumidor do trilho `delivery-proof-processing.v1` — reduz o original do
 * comprovante, gera a miniatura, lê o código de barras sobre o original e apaga o original quando
 * `ready`. Idempotente pelo estado no banco (reentrega de comprovante `ready` é no-op), no molde da
 * prévia da 237 e do anexo do agregado (070).
 */
import type { RabbitMqConsumer, RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import {
  abandonDeliveryProof,
  processDeliveryProof,
  resolveAbandonCode,
  type ProcessDeliveryProofDependencies,
  type ProcessDeliveryProofResult,
} from '../delivery-proof-processing/application/process-delivery-proof.use-case.js'
import { safeLogError, safeLogInfo, safeLogWarn } from '../logging/safe-logger.service.js'
import {
  deliveryProofProcessingEnvelopeV1Schema,
  type DeliveryProofProcessingEnvelopeV1,
} from '../messaging/delivery-proof-processing-envelope.schema.js'
import type { WorkerLogger } from '../shared/worker.types.js'

/**
 * ⚠️ `prefetch` é **1** aqui, como no anexo do agregado: cada mensagem sobe uma `worker_thread` que
 * aloca até 160 MiB de pixels, e o teto de threads simultâneas é o teto de memória do contêiner.
 */
const DELIVERY_PROOF_PREFETCH = 1

type ConsumerParams = {
  readonly dependencies: ProcessDeliveryProofDependencies
  readonly logger: WorkerLogger
  /** O `maxRetries` da topologia: na tentativa que o atinge, a mensagem vai para a fila morta. */
  readonly maxRetries: number
  readonly provider: RabbitMqProvider
}

/**
 * Ids opacos, contagens e códigos: nunca a chave do objeto, o conteúdo, o EXIF nem o texto lido
 * (RNF2, `security.md` §1). Consultável por `proofId` (RF13).
 */
function logProcessing(input: {
  readonly durationMs: number
  readonly envelope: DeliveryProofProcessingEnvelopeV1
  readonly logger: WorkerLogger
  readonly outcome: string
  readonly reason?: string
  readonly result?: ProcessDeliveryProofResult
}): void {
  const { envelope, result } = input
  const metadata = {
    ...(result?.barcode === undefined ? {} : { barcode: result.barcode }),
    companyId: envelope.companyId,
    ...(result?.errorCode === undefined ? {} : { errorCode: result.errorCode }),
    correlationId: envelope.correlationId,
    durationMs: input.durationMs,
    eventId: envelope.eventId,
    ...(result?.originalBytes === undefined ? {} : { originalBytes: result.originalBytes }),
    outcome: input.outcome,
    proofId: envelope.payload.proofId,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(result?.reducedBytes === undefined ? {} : { reducedBytes: result.reducedBytes }),
    ...(result?.thumbnailBytes === undefined ? {} : { thumbnailBytes: result.thumbnailBytes }),
    variant: envelope.payload.variant,
  }
  const log =
    input.outcome === 'retry' || input.outcome === 'abandoned' ? safeLogError : safeLogInfo
  log({ logger: input.logger, message: 'delivery_proof_processing', metadata })
}

export async function startDeliveryProofProcessingConsumer(
  params: ConsumerParams,
): Promise<RabbitMqConsumer> {
  return params.provider.consume<DeliveryProofProcessingEnvelopeV1>({
    decode: (value) => deliveryProofProcessingEnvelopeV1Schema.parse(value),
    handler: async ({ payload, retryCount }) => {
      const startedAt = performance.now()
      const elapsed = (): number => Math.round(performance.now() - startedAt)
      try {
        const result = await processDeliveryProof(payload, params.dependencies)
        logProcessing({
          durationMs: elapsed(),
          envelope: payload,
          logger: params.logger,
          outcome: result.outcome,
          result,
        })
        return { type: 'ack' }
      } catch (error) {
        const reason = error instanceof Error ? error.name : 'unknown'
        if (retryCount < params.maxRetries) {
          logProcessing({
            durationMs: elapsed(),
            envelope: payload,
            logger: params.logger,
            outcome: 'retry',
            reason,
          })
          return { type: 'retry' }
        }

        // Esgotou: `processing_failed` com o original mantido; sem isto a linha ficaria `processing` para sempre.
        await abandonDeliveryProof(payload, {
          code: resolveAbandonCode(error),
          repository: params.dependencies.repository,
        }).catch(() => {
          safeLogWarn({
            logger: params.logger,
            message: 'delivery_proof_abandon_failed',
            metadata: { proofId: payload.payload.proofId },
          })
        })
        logProcessing({
          durationMs: elapsed(),
          envelope: payload,
          logger: params.logger,
          outcome: 'abandoned',
          reason,
        })
        return { type: 'dead-letter' }
      }
    },
    prefetch: DELIVERY_PROOF_PREFETCH,
  })
}
