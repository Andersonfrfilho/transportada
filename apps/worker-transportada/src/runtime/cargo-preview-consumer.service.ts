/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 Fase 4a: o consumidor do trilho `cargo-preview.v1` — leitura da planilha e reavaliação
 * do vínculo. As duas são idempotentes pelo estado no banco (prévia já pronta é no-op; reavaliar o
 * que não mudou não grava nada), então a reentrega do RabbitMQ não duplica nada.
 */
import type { RabbitMqConsumer, RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import {
  processCargoPreview,
  type ProcessCargoPreviewDependencies,
} from '../cargo-preview/application/process-cargo-preview.use-case.js'
import { reevaluateCargoPreviews } from '../cargo-preview/application/reevaluate-cargo-previews.use-case.js'
import { safeLogError, safeLogInfo, safeLogWarn } from '../logging/safe-logger.service.js'
import {
  CARGO_PREVIEW_EVENT_TYPE,
  cargoPreviewEnvelopeV1Schema,
  type CargoPreviewEnvelopeV1,
} from '../messaging/cargo-preview-envelope.schema.js'
import type { WorkerLogger } from '../shared/worker.types.js'

/**
 * ⚠️ `prefetch` 1: a leitura da planilha é CPU no event loop (45–70 ms medidos, teto de 5 s pelo
 * orçamento do leitor) e a reavaliação segura a trava do contratante; uma por vez não deixa uma
 * rajada de envios parar os outros trilhos do worker.
 */
const CARGO_PREVIEW_PREFETCH = 1

/** Ids opacos e contagens; nunca nome de arquivo, destinatário, endereço ou valor (`security.md` §1). */
function metadataOf(envelope: CargoPreviewEnvelopeV1): Record<string, unknown> {
  return {
    companyId: envelope.companyId,
    contractorId: envelope.payload.contractorId,
    eventId: envelope.eventId,
    ...('previewId' in envelope.payload ? { previewId: envelope.payload.previewId } : {}),
  }
}

async function handleEnvelope(
  envelope: CargoPreviewEnvelopeV1,
  input: { readonly dependencies: ProcessCargoPreviewDependencies; readonly logger: WorkerLogger },
): Promise<void> {
  const metadata = metadataOf(envelope)
  if (envelope.type === CARGO_PREVIEW_EVENT_TYPE.PROCESS) {
    const outcome = await processCargoPreview(envelope, input.dependencies)
    safeLogInfo({ logger: input.logger, message: `cargo_preview_process_${outcome}`, metadata })
    return
  }
  const outcome = await reevaluateCargoPreviews(envelope, input.dependencies)
  safeLogInfo({
    logger: input.logger,
    message: 'cargo_preview_reevaluated',
    metadata: { ...metadata, changedItems: outcome.changedItems, previews: outcome.previews },
  })
  if (outcome.aliasConflicts > 0) {
    safeLogWarn({
      logger: input.logger,
      message: 'cargo_preview_alias_conflict',
      metadata: { ...metadata, conflicts: outcome.aliasConflicts },
    })
  }
}

type ConsumerParams = {
  readonly dependencies: ProcessCargoPreviewDependencies
  readonly logger: WorkerLogger
  /** O `maxRetries` da topologia: na tentativa que o atinge, a mensagem vai para a fila morta. */
  readonly maxRetries: number
  readonly provider: RabbitMqProvider
}

/**
 * A leitura que esgotou a fila fecha a prévia como `failed`: sem isso ela ficaria `processing` para
 * sempre, e o reenvio do mesmo arquivo seria só repetição. Se nem isso der (banco fora), o reenvio
 * depois do prazo da leitura reabre a prévia na API.
 */
async function abandonPreview(envelope: CargoPreviewEnvelopeV1, params: ConsumerParams) {
  if (envelope.type !== CARGO_PREVIEW_EVENT_TYPE.PROCESS) return
  await params.dependencies.repository
    .markFailed({
      companyId: envelope.companyId,
      errorCode: 'PREVIEW_PROCESSING_ABANDONED',
      now: params.dependencies.now(),
      previewId: envelope.payload.previewId,
    })
    .catch(() => undefined)
  safeLogWarn({
    logger: params.logger,
    message: 'cargo_preview_abandoned',
    metadata: metadataOf(envelope),
  })
}

export async function startCargoPreviewConsumer(params: ConsumerParams): Promise<RabbitMqConsumer> {
  return params.provider.consume<CargoPreviewEnvelopeV1>({
    decode: (value) => cargoPreviewEnvelopeV1Schema.parse(value),
    handler: async ({ payload, retryCount }) => {
      try {
        await handleEnvelope(payload, params)
        return { type: 'ack' }
      } catch (error) {
        safeLogError({
          logger: params.logger,
          message: 'cargo_preview_failed',
          metadata: {
            ...metadataOf(payload),
            reason: error instanceof Error ? error.name : 'unknown',
          },
        })
        if (retryCount < params.maxRetries) return { type: 'retry' }
        await abandonPreview(payload, params)
        return { type: 'dead-letter' }
      }
    },
    prefetch: CARGO_PREVIEW_PREFETCH,
  })
}
