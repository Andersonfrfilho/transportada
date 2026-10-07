/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF8 (ADR-0094 §9.4–9.5): a avaria sem viagem abre na nota da chegada já conferida, dentro
 * da janela copiada do perfil, com a chegada aberta. Sem janela (perfil sem regra) vale enquanto a
 * chegada estiver aberta. Sem I/O: o relógio entra por parâmetro.
 */
import { createHash } from 'node:crypto'

import {
  CARGO_ARRIVAL_DOCUMENT_STATE,
  CARGO_ARRIVAL_RETURN_STATE,
  CARGO_ARRIVAL_STATUS,
  type CargoArrivalDocumentState,
  type CargoArrivalReturnState,
  type CargoArrivalStatus,
} from '../../shared/cargo-arrival.constant.js'

export const CARGO_ARRIVAL_OCCURRENCE_REFUSAL = {
  closed: 'CARGO_ARRIVAL_CLOSED',
  notReceived: 'CARGO_ARRIVAL_DOCUMENT_NOT_RECEIVED',
  returned: 'CARGO_ARRIVAL_DOCUMENT_RETURNED',
  windowClosed: 'CARGO_ARRIVAL_OCCURRENCE_WINDOW_CLOSED',
} as const
export type CargoArrivalOccurrenceRefusal =
  (typeof CARGO_ARRIVAL_OCCURRENCE_REFUSAL)[keyof typeof CARGO_ARRIVAL_OCCURRENCE_REFUSAL]

export type DecideCargoArrivalOccurrenceOpeningParams = {
  readonly arrivalStatus: CargoArrivalStatus
  readonly now: Date
  readonly returnToContractor: CargoArrivalReturnState
  readonly separationDueAt: Date | null
  readonly separationState: CargoArrivalDocumentState
}

/** `null` é "pode abrir"; o motivo vira código estável na rota. */
export function decideCargoArrivalOccurrenceOpening(
  params: DecideCargoArrivalOccurrenceOpeningParams,
): CargoArrivalOccurrenceRefusal | null {
  if (params.arrivalStatus === CARGO_ARRIVAL_STATUS.closed) {
    return CARGO_ARRIVAL_OCCURRENCE_REFUSAL.closed
  }
  if (params.returnToContractor === CARGO_ARRIVAL_RETURN_STATE.returned) {
    return CARGO_ARRIVAL_OCCURRENCE_REFUSAL.returned
  }
  if (params.separationState === CARGO_ARRIVAL_DOCUMENT_STATE.expected) {
    return CARGO_ARRIVAL_OCCURRENCE_REFUSAL.notReceived
  }
  if (params.separationDueAt !== null && params.now.getTime() > params.separationDueAt.getTime()) {
    return CARGO_ARRIVAL_OCCURRENCE_REFUSAL.windowClosed
  }
  return null
}

export type CargoArrivalOccurrenceFingerprintParams = {
  readonly arrivalId: string
  readonly attachmentSha256: string
  readonly documentId: string
  readonly note: string
  readonly occurrenceTypeId: string
  readonly productCode: string
  readonly productCodes: readonly string[]
  readonly productQuantities: readonly string[]
  readonly productQuantityUnits: readonly string[]
}

/** A mesma chave com outro conteúdo (até outra foto) é reuso, não reenvio. */
export function buildCargoArrivalOccurrenceFingerprint(
  params: CargoArrivalOccurrenceFingerprintParams,
): string {
  const canonical = JSON.stringify([
    params.arrivalId,
    params.documentId,
    params.occurrenceTypeId,
    params.note,
    params.productCode,
    params.productCodes,
    params.productQuantities,
    params.productQuantityUnits,
    params.attachmentSha256,
  ])
  return createHash('sha256').update(canonical).digest('hex')
}
