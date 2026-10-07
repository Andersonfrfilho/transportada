/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a item 8: a cada lote de XMLs do emitente do contratante, os itens em aberto das
 * prévias prontas dele são vinculados de novo contra as notas livres. Repetir é no-op.
 */
import type { CargoPreviewEnvelopeV1 } from '../../messaging/cargo-preview-envelope.schema.js'
import type {
  CargoPreviewWorkerRepositoryPort,
  MatchingOutcome,
} from './cargo-preview-worker.port.js'

export async function reevaluateCargoPreviews(
  envelope: CargoPreviewEnvelopeV1,
  dependencies: {
    readonly now: () => Date
    readonly repository: Pick<CargoPreviewWorkerRepositoryPort, 'reevaluate'>
  },
): Promise<MatchingOutcome> {
  return dependencies.repository.reevaluate({
    companyId: envelope.companyId,
    contractorId: envelope.payload.contractorId,
    now: dependencies.now(),
  })
}
