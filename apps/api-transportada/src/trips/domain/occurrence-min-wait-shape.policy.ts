/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 315 (D10): a espera mínima depois do "Cheguei" exige `arrival_time_mode = 'off'`. Validado sobre o estado
 * RESULTANTE do `PUT` (campo ausente lê o gravado); a CHECK do banco é só a rede.
 */
import { OCCURRENCE_ITEMS_MODE } from '../../shared/trip-occurrence.constant.js'
import type { DeliveryProofFieldMode } from './delivery-proof-settings.policy.js'
import { OccurrenceTypeMinWaitConflictsWithArrivalTimeError } from './trip.error.js'

type MinWaitShape = {
  readonly arrivalTimeMode?: DeliveryProofFieldMode | undefined
  /** Ausente é "não mexa"; `null` limpa a espera mínima. */
  readonly minWaitAfterArrivalMinutes?: null | number | undefined
}

export type AssertMinWaitShapeParams = {
  readonly stored: MinWaitShape | null
  readonly values: MinWaitShape
}

export function assertMinWaitExcludesArrivalTime(params: AssertMinWaitShapeParams): void {
  const { stored, values } = params
  const minutes =
    values.minWaitAfterArrivalMinutes === undefined
      ? (stored?.minWaitAfterArrivalMinutes ?? null)
      : values.minWaitAfterArrivalMinutes
  const mode = values.arrivalTimeMode ?? stored?.arrivalTimeMode ?? OCCURRENCE_ITEMS_MODE.off

  if (minutes !== null && mode !== OCCURRENCE_ITEMS_MODE.off) {
    throw new OccurrenceTypeMinWaitConflictsWithArrivalTimeError()
  }
}
