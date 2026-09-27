/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 193 D5 (ADR-0079 §A3): a configuração de "quem recebeu" aplicada por canal. `off` descarta
 * nos dois; `required` só recusa no escritório, que envia de forma síncrona. No motorista a falta é
 * pendência visível na tela, nunca recusa — nada do formulário derruba a foto.
 */
import type { ReceivedBy } from '../../database/trip.schema.js'
import type { DeliveryProofFieldMode } from './delivery-proof-settings.policy.js'
import { TRIP_FIELD_CHANNELS, type TripFieldChannel } from './trip-field-channel.constant.js'
import { TripDeliveryProofReceivedByRequiredError } from './trip-field-office.error.js'

export type ReceivedByFields = {
  readonly receivedBy: ReceivedBy | null
  readonly receivedByDetail: string | null
}

export const EMPTY_RECEIVED_BY: ReceivedByFields = { receivedBy: null, receivedByDetail: null }

export function applyReceivedBySettings(input: {
  readonly channel: TripFieldChannel
  readonly mode: DeliveryProofFieldMode
  readonly value: ReceivedByFields
}): ReceivedByFields {
  if (input.mode === 'off') return EMPTY_RECEIVED_BY
  const isMissing = input.value.receivedBy === null
  if (input.mode === 'required' && isMissing && input.channel === TRIP_FIELD_CHANNELS.office) {
    throw new TripDeliveryProofReceivedByRequiredError()
  }
  return input.value
}
