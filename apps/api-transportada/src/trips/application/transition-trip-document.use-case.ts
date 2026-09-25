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
import {
  TripDocumentNotFoundError,
  TripDocumentReturnReasonRequiredError,
  TripDocumentTransitionConflictError,
  TripStateTransitionNotAllowedError,
} from '../domain/trip.error.js'
import type { SuggestDeliveryChargesPort } from '../../delivery-clients/application/suggest-delivery-charges.use-case.js'
import {
  tryAutoDispatchTrip,
  type AutoDispatchDependencies,
  type TryAutoDispatchTripResult,
} from './try-auto-dispatch-trip.use-case.js'
import type { TripDocument } from './trip.port.js'

export type TripDocumentTransitionSnapshot = {
  readonly document: TripDocument
  readonly documentStatus: TripDocumentSeparationStatus
  readonly tripStatus: TripStatus
}

export type ApplyTripDocumentTransitionInput = {
  readonly actorUserId: string
  readonly channel: TripFieldChannel
  readonly companyId: string
  readonly documentId: string
  readonly fromStatus: TripDocumentSeparationStatus
  readonly note: string | null
  readonly onBehalfOfDriverId: string | null
  readonly returnReason: string | null
  readonly toStatus: TripDocumentSeparationStatus
  readonly tripId: string
}

export type TripDocumentTransitionOutcome = {
  readonly document: TripDocument
  /** `true` quando o `WHERE fromStatus = ...` não achou linha: alguém escreveu no intervalo. */
  readonly raced: boolean
  readonly tripStatus: TripStatus
}

export type TripDocumentTransitionPort = {
  applyTransition(input: ApplyTripDocumentTransitionInput): Promise<TripDocumentTransitionOutcome>
  findSnapshot(input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<TripDocumentTransitionSnapshot | null>
}

export type TransitionTripDocumentInput = {
  readonly action: TripDocumentAction
  readonly actorUserId: string
  /**
   * Spec 185 (D4, RF2): ausente é instalação sem o gatilho automático ligado — carregar a nota
   * funciona igual, só não tenta despachar. Presente, só é consultado quando `action === 'load'`.
   */
  readonly autoDispatch?: AutoDispatchDependencies
  readonly channel: TripFieldChannel
  readonly companyId: string
  readonly documentId: string
  readonly note?: string | null
  readonly onBehalfOfDriverId?: string | null
  readonly repository: TripDocumentTransitionPort
  readonly returnReason?: string | null
  /** Ausente é instalação sem regra de taxa recorrente — a entrega funciona igual. */
  readonly suggestCharges?: SuggestDeliveryChargesPort
  readonly tripId: string
}

export type TransitionTripDocumentResult = {
  /** Spec 185 (RF2/RF3): ausente quando a carga ainda não fechou, ou a ação não era `load`. */
  readonly autoDispatch?: TryAutoDispatchTripResult
  readonly document: TripDocument
  readonly tripStatus: TripStatus
}

/** Uma corrida real converge em uma ou duas tentativas; além disso é conflito, não retry infinito. */
const MAX_RACE_RETRIES = 3

/**
 * ADR-0043 §1, §4: valida pela T006, escreve estado + timestamp + evento na mesma transação (o
 * `repository.applyTransition` é quem garante isso), recalcula o estado da viagem. Idempotente
 * (RF-8) — repetir a mesma transição não escreve nada e não lança.
 */
/** A data do lançamento é a da entrega, no dia dela — não a de quando alguém confere a sugestão. */
function toDeliveryDate(deliveredAt: string | null): string {
  return (deliveredAt ?? new Date().toISOString()).slice(0, 10)
}

export async function transitionTripDocument(
  input: TransitionTripDocumentInput,
): Promise<TransitionTripDocumentResult> {
  if (
    input.action === TRIP_DOCUMENT_ACTION.return &&
    (input.returnReason ?? '').trim().length === 0
  ) {
    throw new TripDocumentReturnReasonRequiredError()
  }

  return attempt(input, 0)
}

async function attempt(
  input: TransitionTripDocumentInput,
  retries: number,
): Promise<TransitionTripDocumentResult> {
  const snapshot = await input.repository.findSnapshot(input)
  if (snapshot === null) throw new TripDocumentNotFoundError()

  const transition = checkTripDocumentTransition({
    action: input.action,
    documentStatus: snapshot.documentStatus,
    tripStatus: snapshot.tripStatus,
  })

  if (transition.outcome === 'blocked') {
    throw new TripStateTransitionNotAllowedError(transition.reason)
  }
  if (transition.outcome === 'unchanged') {
    return { document: snapshot.document, tripStatus: snapshot.tripStatus }
  }

  const outcome = await input.repository.applyTransition({
    actorUserId: input.actorUserId,
    channel: input.channel,
    companyId: input.companyId,
    documentId: input.documentId,
    fromStatus: snapshot.documentStatus,
    note: input.note ?? null,
    onBehalfOfDriverId: input.onBehalfOfDriverId ?? null,
    returnReason:
      input.action === TRIP_DOCUMENT_ACTION.return ? (input.returnReason ?? null) : null,
    toStatus: transition.nextStatus,
    tripId: input.tripId,
  })

  if (!outcome.raced) {
    /**
     * Spec 060 D4b: a entrega concluída num cliente com regra recorrente **propõe** a taxa. Nunca
     * lança: a entrega já aconteceu, e a sugestão que não gravou não pode desfazê-la.
     */
    if (transition.nextStatus === 'delivered') {
      await input.suggestCharges?.onDelivered({
        companyId: input.companyId,
        deliveredOn: toDeliveryDate(outcome.document.deliveredAt),
        tripDocumentId: input.documentId,
      })
    }

    /**
     * Spec 185 (D4, ADR-0074 §1): a nota é que fecha a carga — só `load` tenta o gatilho, e
     * sempre **depois** de `applyTransition` ter comitado (transação própria).
     */
    const autoDispatch =
      input.action === TRIP_DOCUMENT_ACTION.load && input.autoDispatch !== undefined
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
      document: outcome.document,
      // O status lido na escrita da nota é anterior ao gatilho: quem despachou foi ele.
      tripStatus: autoDispatch?.outcome === 'dispatched' ? 'dispatched' : outcome.tripStatus,
    }
  }
  if (retries >= MAX_RACE_RETRIES) throw new TripDocumentTransitionConflictError()

  return attempt(input, retries + 1)
}
