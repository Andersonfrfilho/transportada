/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2 (ADR-0094 §9.5, ajuste 4): a porta de entrada da ocorrência de recebimento, dentro da
 * transação — trava da chegada, e só então a chave: o reenvio devolve a ocorrência gravada antes de
 * qualquer regra de estado ou de janela, porque o celular reenvia depois que a resposta se perdeu.
 */
import {
  CargoArrivalDocumentNotFoundError,
  CargoArrivalNotFoundError,
  CargoArrivalTransitionRefusedError,
} from '../domain/cargo-arrival.error.js'
import {
  CargoArrivalOccurrenceKeyReusedError,
  CargoArrivalOccurrenceWindowClosedError,
} from '../domain/cargo-arrival-occurrence.error.js'
import {
  CARGO_ARRIVAL_OCCURRENCE_REFUSAL,
  decideCargoArrivalOccurrenceOpening,
} from '../domain/cargo-arrival-occurrence.policy.js'
import type { CargoArrivalOccurrenceTransactionPort } from './cargo-arrival-occurrence.port.js'
import type {
  LockedOccurrenceArrival,
  LockedOccurrenceDocument,
} from './cargo-arrival-occurrence.types.js'

export type OpenableDocument =
  | { readonly kind: 'replay'; readonly occurrenceId: string }
  | {
      readonly arrival: LockedOccurrenceArrival
      readonly document: LockedOccurrenceDocument
      readonly kind: 'open'
    }

export async function lockOpenableDocument(params: {
  readonly documentId: string
  readonly idempotency: { readonly fingerprint: string; readonly key: string }
  readonly now: Date
  readonly transaction: CargoArrivalOccurrenceTransactionPort
}): Promise<OpenableDocument> {
  const { transaction } = params
  const arrival = await transaction.lockArrival()
  if (arrival === null) throw new CargoArrivalNotFoundError()
  const replay = await transaction.findReplay(params.idempotency.key)
  if (replay !== null) {
    if (replay.fingerprint !== params.idempotency.fingerprint) {
      throw new CargoArrivalOccurrenceKeyReusedError()
    }
    return { kind: 'replay', occurrenceId: replay.occurrenceId }
  }
  const document = await transaction.lockDocument(params.documentId)
  if (document === null) throw new CargoArrivalDocumentNotFoundError()
  const refusal = decideCargoArrivalOccurrenceOpening({
    arrivalStatus: arrival.status,
    now: params.now,
    returnToContractor: document.returnToContractor,
    separationDueAt: arrival.separationDueAt,
    separationState: document.separationState,
  })
  if (refusal === CARGO_ARRIVAL_OCCURRENCE_REFUSAL.windowClosed) {
    throw new CargoArrivalOccurrenceWindowClosedError()
  }
  if (refusal !== null) throw new CargoArrivalTransitionRefusedError(refusal)
  return { arrival, document, kind: 'open' }
}
