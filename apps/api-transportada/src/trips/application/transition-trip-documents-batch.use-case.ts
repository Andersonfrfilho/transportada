/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripDocumentSeparationStatus, TripStatus } from '../../database/trip.schema.js'
import type { TripFieldChannel } from '../domain/trip-field-channel.constant.js'
import {
  TRIP_DOCUMENT_ACTION,
  checkTripDocumentTransition,
  type TripDocumentAction,
} from '../domain/trip-state.policy.js'
import { TripDocumentReturnReasonRequiredError, TripNotFoundError } from '../domain/trip.error.js'
import type { TripTransitionBlock } from '../domain/trip-state.policy.js'
import {
  tryAutoDispatchTrip,
  type AutoDispatchDependencies,
  type TryAutoDispatchTripResult,
} from './try-auto-dispatch-trip.use-case.js'
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
  readonly channel: TripFieldChannel
  readonly companyId: string
  readonly items: readonly AppliedTripDocumentTransition[]
  readonly note: string | null
  readonly onBehalfOfDriverId: string | null
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
  /**
   * Spec 185 (D4, RF2): ausente é instalação sem o gatilho automático ligado. Presente, só é
   * consultado quando `action === 'load'` e ao menos uma nota do lote foi de fato aplicada.
   */
  readonly autoDispatch?: AutoDispatchDependencies
  readonly channel: TripFieldChannel
  readonly companyId: string
  readonly documentIds: readonly string[]
  readonly note?: string | null
  readonly onBehalfOfDriverId?: string | null
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
  /** Spec 185 (RF2/RF3): ausente quando a carga ainda não fechou, ou a ação não era `load`. */
  readonly autoDispatch?: TryAutoDispatchTripResult
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
    channel: input.channel,
    companyId: input.companyId,
    items: toApply,
    note: input.note ?? null,
    onBehalfOfDriverId: input.onBehalfOfDriverId ?? null,
    returnReason:
      input.action === TRIP_DOCUMENT_ACTION.return ? (input.returnReason ?? null) : null,
    tripId: input.tripId,
  })

  const racedIds = new Set(written.racedDocumentIds)
  let appliedCount = 0
  for (const item of toApply) {
    const raced = racedIds.has(item.documentId)
    if (!raced) appliedCount += 1
    preWriteOutcomes.set(item.documentId, {
      documentId: item.documentId,
      outcome: raced ? 'raced' : 'applied',
    })
  }

  /**
   * Spec 185 (D4, ADR-0074 §1): a corrida perdida (nenhuma aplicada de fato) não é escrita desta
   * chamada — quem venceu já tenta o próprio gatilho. Só quem realmente carregou nota tenta.
   */
  const autoDispatch =
    input.action === TRIP_DOCUMENT_ACTION.load &&
    appliedCount > 0 &&
    input.autoDispatch !== undefined
      ? await tryAutoDispatchTrip({
          ...input.autoDispatch,
          actorUserId: input.actorUserId,
          channel: input.channel,
          companyId: input.companyId,
          onBehalfOfDriverId: input.onBehalfOfDriverId ?? null,
          tripId: input.tripId,
        })
      : undefined

  return {
    ...(autoDispatch === undefined ? {} : { autoDispatch }),
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
