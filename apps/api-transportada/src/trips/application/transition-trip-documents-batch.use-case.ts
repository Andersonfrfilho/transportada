/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripDocumentSeparationStatus, TripStatus } from '../../database/trip.schema.js'
import {
  TRIP_DOCUMENT_ACTION,
  checkTripDocumentTransition,
  type TripDocumentAction,
} from '../domain/trip-state.policy.js'
import { TripDocumentReturnReasonRequiredError, TripNotFoundError } from '../domain/trip.error.js'
import type { TripTransitionBlock } from '../domain/trip-state.policy.js'
import type { TripDocument } from './trip.port.js'

export type TripDocumentSnapshotById = ReadonlyMap<
  string,
  { readonly document: TripDocument; readonly documentStatus: TripDocumentSeparationStatus }
>

export type AppliedTripDocumentTransition = {
  readonly documentId: string
  readonly fromStatus: TripDocumentSeparationStatus
  readonly toStatus: TripDocumentSeparationStatus
}

export type TripDocumentBatchWriteInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly items: readonly AppliedTripDocumentTransition[]
  readonly note: string | null
  readonly returnReason: string | null
  readonly tripId: string
}

export type TripDocumentBatchWriteResult = {
  /** Ids que a T006 mandou aplicar mas o `UPDATE` guardado não achou — corrida (spec 056 D2). */
  readonly racedDocumentIds: readonly string[]
  readonly tripStatus: TripStatus
  readonly updatedDocuments: readonly TripDocument[]
}

/**
 * Escopo mínimo do banco para o lote: uma leitura para todos os ids, uma escrita para todos os
 * aplicados. É o que torna "uma ida ao banco por tabela" possível — nada aqui itera por documento.
 */
export type TripDocumentBatchTransitionPort = {
  findSnapshots(input: {
    readonly companyId: string
    readonly documentIds: readonly string[]
    readonly tripId: string
  }): Promise<{
    readonly snapshots: TripDocumentSnapshotById
    readonly tripStatus: TripStatus
  } | null>
  writeBatch(input: TripDocumentBatchWriteInput): Promise<TripDocumentBatchWriteResult>
}

export type TransitionTripDocumentsBatchInput = {
  readonly action: TripDocumentAction
  readonly actorUserId: string
  readonly companyId: string
  readonly documentIds: readonly string[]
  readonly note?: string | null
  readonly repository: TripDocumentBatchTransitionPort
  readonly returnReason?: string | null
  readonly tripId: string
}

export type TripDocumentBatchItemOutcome =
  | { readonly documentId: string; readonly outcome: 'applied' }
  | {
      readonly documentId: string
      readonly outcome: 'blocked'
      readonly reason: TripTransitionBlock
    }
  | { readonly documentId: string; readonly outcome: 'not_found' }
  | { readonly documentId: string; readonly outcome: 'raced' }
  | { readonly documentId: string; readonly outcome: 'unchanged' }

export type TransitionTripDocumentsBatchResult = {
  readonly items: readonly TripDocumentBatchItemOutcome[]
  readonly tripStatus: TripStatus
}

/**
 * ADR-0043 §1: a operação real do armazém é marcar um maço de notas de uma vez, não uma a uma. O
 * lote inteiro é uma transação e uma ida ao banco por tabela — o custo não cresce com o tamanho
 * do maço. Cada nota é resolvida por conta própria pela T006: pendente vira aplicada, já-alvo vira
 * `unchanged`, e o que a máquina recusa não impede as demais de seguir — um bloqueio no meio do
 * maço não é motivo para travar o resto.
 */
export async function transitionTripDocumentsBatch(
  input: TransitionTripDocumentsBatchInput,
): Promise<TransitionTripDocumentsBatchResult> {
  if (
    input.action === TRIP_DOCUMENT_ACTION.return &&
    (input.returnReason ?? '').trim().length === 0
  ) {
    throw new TripDocumentReturnReasonRequiredError()
  }

  const read = await input.repository.findSnapshots({
    companyId: input.companyId,
    documentIds: input.documentIds,
    tripId: input.tripId,
  })
  if (read === null) throw new TripNotFoundError()

  const toApply: AppliedTripDocumentTransition[] = []
  const preWriteOutcomes = new Map<string, TripDocumentBatchItemOutcome>()

  for (const documentId of input.documentIds) {
    const snapshot = read.snapshots.get(documentId)
    if (snapshot === undefined) {
      preWriteOutcomes.set(documentId, { documentId, outcome: 'not_found' })
      continue
    }

    const transition = checkTripDocumentTransition({
      action: input.action,
      documentStatus: snapshot.documentStatus,
      tripStatus: read.tripStatus,
    })

    if (transition.outcome === 'blocked') {
      preWriteOutcomes.set(documentId, {
        documentId,
        outcome: 'blocked',
        reason: transition.reason,
      })
    } else if (transition.outcome === 'unchanged') {
      preWriteOutcomes.set(documentId, { documentId, outcome: 'unchanged' })
    } else {
      toApply.push({
        documentId,
        fromStatus: snapshot.documentStatus,
        toStatus: transition.nextStatus,
      })
    }
  }

  if (toApply.length === 0) {
    return {
      items: input.documentIds.map(
        (documentId) =>
          preWriteOutcomes.get(documentId) ?? {
            documentId,
            outcome: 'not_found',
          },
      ),
      tripStatus: read.tripStatus,
    }
  }

  const written = await input.repository.writeBatch({
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    items: toApply,
    note: input.note ?? null,
    returnReason:
      input.action === TRIP_DOCUMENT_ACTION.return ? (input.returnReason ?? null) : null,
    tripId: input.tripId,
  })

  const racedIds = new Set(written.racedDocumentIds)
  for (const item of toApply) {
    preWriteOutcomes.set(item.documentId, {
      documentId: item.documentId,
      outcome: racedIds.has(item.documentId) ? 'raced' : 'applied',
    })
  }

  return {
    items: input.documentIds.map(
      (documentId) =>
        preWriteOutcomes.get(documentId) ?? {
          documentId,
          outcome: 'not_found',
        },
    ),
    tripStatus: written.tripStatus,
  }
}
