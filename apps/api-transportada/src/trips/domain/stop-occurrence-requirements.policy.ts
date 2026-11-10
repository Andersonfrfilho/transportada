/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 315 (D2–D7, D10): o que o tipo de uma ocorrência de **parada** cobra do registro — foto, observação,
 * localização, horário de chegada e espera mínima depois do "Cheguei". Política pura: o caso de uso lê o tipo e a
 * parada, e esta função decide, sem relógio nem banco.
 *
 * Só o tipo declara estes modos (a exceção por contratante/destinatário não os alcança, D8 da spec 246 vale só
 * para a ocorrência por nota). `off` e `optional` nunca recusam.
 */
import { REQUIRED_PROOF_FIELD_MODE } from './delivery-event.constant.js'
import type { DeliveryProofFieldMode } from './delivery-proof-settings.policy.js'
import {
  TripOccurrenceArrivalTimeRequiredError,
  TripOccurrenceAttachmentRequiredError,
  TripOccurrenceLocationRequiredError,
  TripOccurrenceMinWaitNotReachedError,
  TripOccurrenceNoteRequiredError,
  TripOccurrencePhotoMinimumNotMetError,
} from './trip.error.js'

const MILLISECONDS_PER_MINUTE = 60_000

/** O que o cadastro do tipo declara para o registro de parada. */
export type StopOccurrenceTypeRequirements = {
  readonly arrivalTimeMode: DeliveryProofFieldMode
  readonly attachmentMode: DeliveryProofFieldMode
  readonly locationMode: DeliveryProofFieldMode
  /** Nulo é sem espera mínima. */
  readonly minWaitAfterArrivalMinutes: null | number
  readonly noteMode: DeliveryProofFieldMode
  readonly photoMinimumCount: number
}

export type AssertStopOccurrenceRequirementsParams = {
  /** A parada já tem "Cheguei" gravado (lido na transação do registro). */
  readonly arrivedAt: Date | null
  /** O horário de chegada que o registro informou; nulo é não informado. */
  readonly informedArrivalAt: Date | null
  readonly hasLocation: boolean
  readonly attachmentCount: number
  readonly isOffice: boolean
  readonly note: string
  readonly now: Date
  readonly requirements: StopOccurrenceTypeRequirements
}

export type StopOccurrenceArrivalDecision =
  /** A parada já tinha chegada, ou o tipo não pede nem aceita horário: nada a gravar. */
  | { readonly kind: 'none' }
  /** Grava a chegada nesse horário, junto da ocorrência. */
  | { readonly arrivalAt: Date; readonly kind: 'record' }

function isRequired(mode: DeliveryProofFieldMode): boolean {
  return mode === REQUIRED_PROOF_FIELD_MODE
}

/**
 * Espera mínima (D10): o motorista só registra depois de `arrived_at + N`. O escritório não tem a trava. Sem
 * "Cheguei" o tipo fica bloqueado para o motorista — o horário digitado na própria ocorrência não destrava.
 */
function assertMinWaitReached(params: AssertStopOccurrenceRequirementsParams): void {
  const { arrivedAt, isOffice, now, requirements } = params
  const minutes = requirements.minWaitAfterArrivalMinutes
  if (minutes === null || isOffice) return
  if (arrivedAt === null) throw new TripOccurrenceMinWaitNotReachedError({ availableAt: null })

  const availableAt = new Date(arrivedAt.getTime() + minutes * MILLISECONDS_PER_MINUTE)
  if (now.getTime() < availableAt.getTime())
    throw new TripOccurrenceMinWaitNotReachedError({ availableAt })
}

/**
 * Decide se o registro grava a chegada. O escritório, num tipo com espera mínima, é obrigado a informar a hora em
 * que o motorista chegou quando a parada não tem chegada (D10).
 */
function decideArrival(
  params: AssertStopOccurrenceRequirementsParams,
): StopOccurrenceArrivalDecision {
  const { arrivedAt, informedArrivalAt, isOffice, requirements } = params
  if (arrivedAt !== null) return { kind: 'none' }

  const officeMustInform = isOffice && requirements.minWaitAfterArrivalMinutes !== null
  const mode = requirements.arrivalTimeMode
  if (informedArrivalAt === null) {
    if (isRequired(mode) || officeMustInform) throw new TripOccurrenceArrivalTimeRequiredError()
    return { kind: 'none' }
  }
  if (mode === 'off' && !officeMustInform) return { kind: 'none' }
  return { arrivalAt: informedArrivalAt, kind: 'record' }
}

/**
 * Confere o registro de parada contra o tipo, nesta ordem: espera mínima, localização, foto, observação, horário.
 * Foto e observação só se cobram do motorista: o escritório não tem o anexo da parada (spec 209).
 */
export function assertStopOccurrenceRequirements(
  params: AssertStopOccurrenceRequirementsParams,
): StopOccurrenceArrivalDecision {
  const { attachmentCount, hasLocation, isOffice, note, requirements } = params
  assertMinWaitReached(params)
  if (!isOffice && isRequired(requirements.locationMode) && !hasLocation) {
    throw new TripOccurrenceLocationRequiredError()
  }
  if (!isOffice && isRequired(requirements.attachmentMode)) {
    if (attachmentCount === 0) throw new TripOccurrenceAttachmentRequiredError()
    if (attachmentCount < requirements.photoMinimumCount) {
      throw new TripOccurrencePhotoMinimumNotMetError()
    }
  }
  if (!isOffice && isRequired(requirements.noteMode) && note.trim() === '') {
    throw new TripOccurrenceNoteRequiredError()
  }

  return decideArrival(params)
}
